import crypto from "node:crypto";
import { newId } from "../lib/id.js";
import { signWebhookBody } from "./signature.js";

export class WebhookDispatcher {
  constructor({ config, store }) {
    this.config = config;
    this.store = store;
  }

  buildEvent(order, eventType) {
    const eventId = newId("evt");
    return {
      eventId,
      eventType,
      idempotencyKey: `${order.id}:${eventType}:${order.status}`,
      order: {
        id: order.id,
        orderNo: order.orderNo,
        amount: order.amount,
        amountCents: order.amountCents,
        subject: order.subject,
        status: order.status,
        provider: order.provider,
        paidAt: order.paidAt || null
      },
      createdAt: new Date().toISOString()
    };
  }

  async dispatch(order, eventType) {
    const targetUrl = order.webhookUrl || this.config.defaultWebhookUrl;
    if (!targetUrl) return null;

    const event = this.buildEvent(order, eventType);
    const rawBody = JSON.stringify(event);
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomBytes(12).toString("hex");
    const signature = signWebhookBody(this.config.webhookSecret, timestamp, nonce, rawBody);

    const delivery = {
      id: newId("dlv"),
      orderId: order.id,
      eventId: event.eventId,
      idempotencyKey: event.idempotencyKey,
      targetUrl,
      signature,
      status: "PENDING",
      attemptCount: 1,
      responseCode: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Callback-Event-Id": event.eventId,
          "X-Callback-Idempotency-Key": event.idempotencyKey,
          "X-Callback-Timestamp": timestamp,
          "X-Callback-Nonce": nonce,
          "X-Callback-Signature": signature
        },
        body: rawBody,
        signal: AbortSignal.timeout(8000)
      });

      delivery.responseCode = response.status;
      delivery.status = response.ok ? "DELIVERED" : "FAILED";
      if (!response.ok) delivery.error = `HTTP ${response.status}`;
    } catch (error) {
      delivery.status = "FAILED";
      delivery.error = error.message;
    }

    delivery.updatedAt = new Date().toISOString();
    await this.store.update((data) => {
      data.webhookDeliveries.push(delivery);
      const storedOrder = data.orders.find((item) => item.id === order.id);
      if (storedOrder) {
        storedOrder.status = delivery.status === "DELIVERED" ? "WEBHOOK_DELIVERED" : "WEBHOOK_FAILED";
        storedOrder.updatedAt = delivery.updatedAt;
      }
      return delivery;
    });

    return delivery;
  }
}
