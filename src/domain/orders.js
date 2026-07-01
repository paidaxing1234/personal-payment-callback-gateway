import { AppError } from "../lib/errors.js";
import { newCheckoutToken, newId, newOrderNo } from "../lib/id.js";
import { centsToAmount, parseAmountToCents } from "../lib/money.js";
import { validateWebhookUrl } from "../lib/security.js";

const TERMINAL_STATUSES = new Set(["CANCELLED", "EXPIRED", "WEBHOOK_DELIVERED"]);
const PAID_STATUSES = new Set(["PAID_MANUAL_CONFIRMED", "WEBHOOK_DELIVERED"]);

function nowIso() {
  return new Date().toISOString();
}

function publicOrder(order) {
  return { ...order };
}

function checkoutUrlFor(order, publicBaseUrl = "") {
  if (!order.checkoutToken) return "";
  const path = `/pay/${encodeURIComponent(order.checkoutToken)}`;
  return publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, "")}${path}` : path;
}

function merchantOrder(order, publicBaseUrl = "") {
  return {
    ...order,
    checkoutUrl: checkoutUrlFor(order, publicBaseUrl)
  };
}

function checkoutOrder(order, config) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    amount: order.amount,
    amountCents: order.amountCents,
    currency: order.currency,
    subject: order.subject,
    status: order.status,
    payerHint: order.payerHint || "",
    checkoutUrl: checkoutUrlFor(order, config.publicBaseUrl),
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    submittedAt: order.submittedAt || null,
    payment: {
      accountLabel: config.paymentAccountLabel,
      qrImageUrl: config.paymentQrImageUrl,
      instructions: config.paymentInstructions
    }
  };
}

function addAudit(data, req, action, resourceType, resourceId, before, after, note = "") {
  data.auditLogs.push({
    id: newId("aud"),
    actorType: req?.actorType || "system",
    actorId: req?.actorId || "anonymous",
    action,
    resourceType,
    resourceId,
    before,
    after,
    note,
    ip: req?.ip || "",
    userAgent: req?.userAgent || "",
    createdAt: nowIso()
  });
}

function addPaymentEvent(data, order, eventType, source, payload = {}) {
  data.paymentEvents.push({
    id: newId("pev"),
    orderId: order.id,
    eventType,
    source,
    payload,
    createdAt: nowIso()
  });
}

export class OrderService {
  constructor({ store, config, dispatcher }) {
    this.store = store;
    this.config = config;
    this.dispatcher = dispatcher;
  }

  async listOrders() {
    const data = await this.store.read();
    return data.orders.map((order) => merchantOrder(order, this.config.publicBaseUrl)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getOrder(id) {
    const data = await this.store.read();
    const order = data.orders.find((item) => item.id === id || item.orderNo === id);
    if (!order) throw new AppError(404, "order_not_found", "Order not found.");
    return merchantOrder(order, this.config.publicBaseUrl);
  }

  async getCheckout(token) {
    const data = await this.store.read();
    const order = data.orders.find((item) => item.checkoutToken === token);
    if (!order) throw new AppError(404, "checkout_not_found", "Checkout page not found.");
    return checkoutOrder(order, this.config);
  }

  async createOrder(input, actor) {
    const amountCents = parseAmountToCents(input.amount);
    const subject = String(input.subject || "").trim();
    if (!subject) throw new AppError(400, "invalid_subject", "Subject is required.");
    if (subject.length > 120) throw new AppError(400, "invalid_subject", "Subject must be 120 characters or fewer.");

    const webhookUrl = validateWebhookUrl(input.webhookUrl || this.config.defaultWebhookUrl, this.config.allowPrivateWebhooks);
    const createdAt = nowIso();
    const order = {
      id: newId("ord"),
      orderNo: newOrderNo(),
      checkoutToken: newCheckoutToken(),
      amount: centsToAmount(amountCents),
      amountCents,
      currency: "CNY",
      subject,
      status: "PENDING_PAYMENT",
      provider: "manual",
      payerHint: String(input.payerHint || "").slice(0, 120),
      webhookUrl,
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      createdAt,
      updatedAt: createdAt,
      paidAt: null,
      submittedAt: null,
      payerSubmission: null,
      expiresAt: input.expiresAt || null
    };

    return this.store.update((data) => {
      data.orders.push(order);
      addPaymentEvent(data, order, "ORDER_CREATED", "api", { amount: order.amount, subject: order.subject });
      addAudit(data, actor, "order.create", "order", order.id, null, order);
      return merchantOrder(order, this.config.publicBaseUrl);
    });
  }

  async submitPayerProof(token, input, actor) {
    return this.store.update((data) => {
      const order = data.orders.find((item) => item.checkoutToken === token);
      if (!order) throw new AppError(404, "checkout_not_found", "Checkout page not found.");
      if (TERMINAL_STATUSES.has(order.status) || PAID_STATUSES.has(order.status)) {
        return checkoutOrder(order, this.config);
      }
      if (!["PENDING_PAYMENT", "PENDING_MANUAL_REVIEW"].includes(order.status)) {
        throw new AppError(409, "invalid_order_state", `Cannot submit payer proof from ${order.status}.`);
      }

      const before = { ...order };
      const submittedAt = nowIso();
      order.status = "PENDING_MANUAL_REVIEW";
      order.submittedAt = submittedAt;
      order.updatedAt = submittedAt;
      order.payerSubmission = {
        payerName: String(input.payerName || "").slice(0, 80),
        payerNote: String(input.payerNote || "").slice(0, 240),
        submittedAt
      };
      addPaymentEvent(data, order, "PAYER_SUBMITTED_PROOF", "checkout", order.payerSubmission);
      addAudit(data, actor, "order.payer_submit", "order", order.id, before, order, order.payerSubmission.payerNote);
      return checkoutOrder(order, this.config);
    });
  }

  async cancelOrder(id, input, actor) {
    return this.store.update((data) => {
      const order = data.orders.find((item) => item.id === id || item.orderNo === id);
      if (!order) throw new AppError(404, "order_not_found", "Order not found.");
      if (PAID_STATUSES.has(order.status)) {
        throw new AppError(409, "order_already_paid", "Paid orders cannot be cancelled.");
      }
      if (TERMINAL_STATUSES.has(order.status)) return publicOrder(order);

      const before = { ...order };
      order.status = "CANCELLED";
      order.cancelReason = String(input.reason || "cancelled").slice(0, 200);
      order.updatedAt = nowIso();
      addPaymentEvent(data, order, "ORDER_CANCELLED", "admin", { reason: order.cancelReason });
      addAudit(data, actor, "order.cancel", "order", order.id, before, order, order.cancelReason);
      return publicOrder(order);
    });
  }

  async confirmPaid(id, input, actor, source = "manual") {
    const updatedOrder = await this.store.update((data) => {
      const order = data.orders.find((item) => item.id === id || item.orderNo === id);
      if (!order) throw new AppError(404, "order_not_found", "Order not found.");
      if (order.status === "WEBHOOK_FAILED") return publicOrder(order);
      if (PAID_STATUSES.has(order.status)) return publicOrder(order);
      if (TERMINAL_STATUSES.has(order.status)) {
        throw new AppError(409, "invalid_order_state", `Cannot confirm order from ${order.status}.`);
      }

      if (input.amount !== undefined) {
        const paidAmountCents = parseAmountToCents(input.amount);
        if (paidAmountCents !== order.amountCents) {
          throw new AppError(409, "amount_mismatch", "Paid amount does not match the order amount.");
        }
      }

      const before = { ...order };
      order.status = "PAID_MANUAL_CONFIRMED";
      order.paidAt = nowIso();
      order.updatedAt = order.paidAt;
      order.confirmNote = String(input.note || "").slice(0, 300);
      addPaymentEvent(data, order, "PAYMENT_CONFIRMED", source, { note: order.confirmNote });
      addAudit(data, actor, "order.confirm_paid", "order", order.id, before, order, order.confirmNote);
      return publicOrder(order);
    });

    await this.dispatcher.dispatch(updatedOrder, "payment.confirmed");
    return this.getOrder(updatedOrder.id);
  }

  async simulateProviderNotify(input, actor) {
    const orderId = input.orderId || input.orderNo;
    if (!orderId) throw new AppError(400, "missing_order_id", "orderId or orderNo is required.");
    return this.confirmPaid(orderId, { amount: input.amount, note: "simulated provider notification" }, actor, "simulate_provider");
  }

  async listAuditLogs() {
    const data = await this.store.read();
    return data.auditLogs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listDeliveries() {
    const data = await this.store.read();
    return data.webhookDeliveries.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
