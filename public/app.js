const ordersEl = document.querySelector("#orders");
const statusText = document.querySelector("#statusText");
const orderForm = document.querySelector("#orderForm");
const refreshBtn = document.querySelector("#refreshBtn");
const adminTokenInput = document.querySelector("#adminToken");

function adminHeaders() {
  const token = adminTokenInput.value.trim();
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
  ordersEl.innerHTML = "";
  if (!orders.length) {
    ordersEl.innerHTML = "<p class=\"muted\">还没有订单。</p>";
    return;
  }

  for (const order of orders) {
    const item = document.createElement("article");
    item.className = "order";
    item.innerHTML = `
      <div class="orderMain">
        <div class="orderTitle">
          <strong>${order.subject}</strong>
          <span class="badge">${order.status}</span>
          <span class="amount">CNY ${order.amount}</span>
        </div>
        <div class="orderMeta">${order.orderNo}</div>
        <div class="orderMeta">Webhook: ${order.webhookUrl || "未设置"}</div>
      </div>
      <div class="orderActions">
        <button class="secondary" data-action="confirm" data-id="${order.id}" type="button">确认到账</button>
        <button class="danger" data-action="cancel" data-id="${order.id}" type="button">取消</button>
      </div>
    `;
    ordersEl.appendChild(item);
  }
}

async function loadOrders() {
  statusText.textContent = "加载中";
  const body = await request("/api/orders");
  renderOrders(body.orders);
  statusText.textContent = `共 ${body.orders.length} 单`;
}

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(orderForm);
  const payload = Object.fromEntries(form.entries());
  if (!payload.webhookUrl) delete payload.webhookUrl;
  await request("/api/orders", { method: "POST", body: JSON.stringify(payload) });
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
  statusText.textContent = error.message;
});
