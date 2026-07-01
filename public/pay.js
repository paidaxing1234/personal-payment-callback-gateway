const panel = document.querySelector("#checkoutPanel");
const token = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");

function el(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value !== undefined && value !== "") node.setAttribute(key, value);
    }
  }
  return node;
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

function render(order) {
  panel.replaceChildren();

  const header = el("div", { className: "checkoutHeader" });
  header.append(
    el("span", { className: "badge", text: order.status }),
    el("h2", { text: order.subject }),
    el("div", { className: "checkoutAmount", text: `CNY ${order.amount}` })
  );

  const details = el("div", { className: "checkoutDetails" });
  details.append(
    el("div", { text: `订单号：${order.orderNo}` }),
    el("div", { text: `收款账户：${order.payment.accountLabel || "请以页面旁实际收款码为准"}` }),
    el("div", { text: `付款说明：${order.payment.instructions}` })
  );

  const qrWrap = el("div", { className: "qrWrap" });
  if (order.payment.qrImageUrl) {
    qrWrap.append(el("img", { attrs: { src: order.payment.qrImageUrl, alt: "收款二维码" } }));
  } else {
    qrWrap.append(el("div", { className: "qrPlaceholder", text: "未配置二维码图片，请向收款方索取收款码或在旁边展示实体二维码。" }));
  }

  const form = el("form", { className: "checkoutForm" });
  const payerName = el("input", { attrs: { name: "payerName", placeholder: "付款人姓名或备注名" } });
  const payerNote = el("input", { attrs: { name: "payerNote", placeholder: "付款备注，例如支付宝账单尾号" } });
  const submit = el("button", { text: order.status === "PENDING_MANUAL_REVIEW" ? "已提交，等待确认" : "我已付款，提交确认" });
  submit.type = "submit";
  submit.disabled = !["PENDING_PAYMENT", "PENDING_MANUAL_REVIEW"].includes(order.status);

  form.append(payerName, payerNote, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    const body = await request(`/api/checkout/${encodeURIComponent(token)}/submit`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    render(body.order);
  });

  panel.append(header, qrWrap, details, form);
}

async function boot() {
  const body = await request(`/api/checkout/${encodeURIComponent(token)}`);
  render(body.order);
}

boot().catch((error) => {
  panel.replaceChildren(el("p", { className: "muted", text: error.message }));
});
