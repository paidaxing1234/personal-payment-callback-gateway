const ordersEl = document.querySelector("#orders");
const statusText = document.querySelector("#statusText");
const orderForm = document.querySelector("#orderForm");
const refreshBtn = document.querySelector("#refreshBtn");
const adminTokenInput = document.querySelector("#adminToken");
const merchantTokenInput = document.querySelector("#merchantToken");

function adminHeaders() {
  const token = adminTokenInput.value.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function merchantHeaders() {
  const token = merchantTokenInput.value.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "请求失败");
  return body;
}

function renderOrders(orders) {
  ordersEl.replaceChildren();
  if (!orders.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "还没有订单。";
    ordersEl.appendChild(empty);
    return;
  }

  for (const order of orders) {
    const item = document.createElement("article");
    item.className = "order";

    const orderMain = document.createElement("div");
    orderMain.className = "orderMain";

    const orderTitle = document.createElement("div");
    orderTitle.className = "orderTitle";

    const subject = document.createElement("strong");
    subject.textContent = order.subject;

    const status = document.createElement("span");
    status.className = "badge";
    status.textContent = order.status;

    const amount = document.createElement("span");
    amount.className = "amount";
    amount.textContent = `CNY ${order.amount}`;

    orderTitle.append(subject, status, amount);

    const orderNo = document.createElement("div");
    orderNo.className = "orderMeta";
    orderNo.textContent = order.orderNo;

    const webhookUrl = document.createElement("div");
    webhookUrl.className = "orderMeta";
    webhookUrl.textContent = `Webhook: ${order.webhookUrl || "未设置"}`;

    orderMain.append(orderTitle, orderNo, webhookUrl);

    const actions = document.createElement("div");
    actions.className = "orderActions";

    const confirm = document.createElement("button");
    confirm.className = "secondary";
    confirm.dataset.action = "confirm";
    confirm.dataset.id = order.id;
    confirm.type = "button";
    confirm.textContent = "确认到账";

    const cancel = document.createElement("button");
    cancel.className = "danger";
    cancel.dataset.action = "cancel";
    cancel.dataset.id = order.id;
    cancel.type = "button";
    cancel.textContent = "取消";

    actions.append(confirm, cancel);
    item.append(orderMain, actions);
    ordersEl.appendChild(item);
  }
}

async function loadOrders() {
  statusText.textContent = "加载中";
  const body = await request("/api/orders", { headers: merchantHeaders() });
  renderOrders(body.orders);
  statusText.textContent = `共 ${body.orders.length} 单`;
}

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(orderForm);
  const payload = Object.fromEntries(form.entries());
  if (!payload.webhookUrl) delete payload.webhookUrl;
  await request("/api/orders", { method: "POST", headers: merchantHeaders(), body: JSON.stringify(payload) });
  orderForm.reset();
  await loadOrders();
});

ordersEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  const path = action === "confirm" ? `/api/orders/${id}/confirm` : `/api/orders/${id}/cancel`;
  const body = action === "confirm" ? { note: "admin confirmed from web UI" } : { reason: "cancelled from web UI" };
  await request(path, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body)
  });
  await loadOrders();
});

refreshBtn.addEventListener("click", loadOrders);

loadOrders().catch((error) => {
  statusText.textContent = error.message.includes("Invalid or missing") ? "请输入 Merchant Token 后刷新" : error.message;
});
