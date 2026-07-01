import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../lib/errors.js";
import { getPathParams, notFound, readJson, sendJson } from "../lib/http.js";
import { requireAdmin, requireBearer, requireMerchant } from "../lib/security.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC_DIR = path.join(ROOT, "public");

function actorFrom(req) {
  return {
    actorType: "admin",
    actorId: "api",
    ip: req.socket.remoteAddress || "",
    userAgent: req.headers["user-agent"] || ""
  };
}

async function sendStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(PUBLIC_DIR, `.${safePath}`);
  if (!filePath.startsWith(PUBLIC_DIR)) throw new AppError(403, "forbidden", "Forbidden.");

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8"
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    res.end(content);
  } catch {
    notFound(res);
  }
}

async function sendStaticFile(res, fileName) {
  const filePath = path.resolve(PUBLIC_DIR, fileName);
  if (!filePath.startsWith(PUBLIC_DIR)) throw new AppError(403, "forbidden", "Forbidden.");
  const content = await fs.readFile(filePath);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(content);
}

export function createRouter({ config, orderService }) {
  return async function route(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/health") {
      return sendJson(res, 200, { ok: true, service: "personal-payment-callback-gateway" });
    }

    if (req.method === "GET" && pathname === "/api/compliance") {
      return sendJson(res, 200, {
        officialPersonalCodeCallback: false,
        message: "普通个人收款码没有官方异步回调。本系统只提供订单记录、人工确认、审计和签名 Webhook 转发。",
        recommendedProductionPath: [
          "Use Alipay Open Platform payment products.",
          "Verify official notify_url signatures.",
          "Use trade query and bill reconciliation as fallback."
        ]
      });
    }

    let params = getPathParams(pathname, "/api/checkout/:token");
    if (params && req.method === "GET") {
      return sendJson(res, 200, { order: await orderService.getCheckout(params.token) });
    }

    params = getPathParams(pathname, "/api/checkout/:token/submit");
    if (params && req.method === "POST") {
      const body = await readJson(req);
      const order = await orderService.submitPayerProof(params.token, body, {
        actorType: "payer",
        actorId: "checkout",
        ip: req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || ""
      });
      return sendJson(res, 200, { order });
    }

    if (req.method === "GET" && pathname === "/api/orders") {
      requireMerchant(req, config);
      return sendJson(res, 200, { orders: await orderService.listOrders() });
    }

    if (req.method === "POST" && pathname === "/api/orders") {
      requireMerchant(req, config);
      const body = await readJson(req);
      const order = await orderService.createOrder(body, { actorType: "public_api", actorId: "merchant", ip: req.socket.remoteAddress || "", userAgent: req.headers["user-agent"] || "" });
      return sendJson(res, 201, { order });
    }

    params = getPathParams(pathname, "/api/orders/:id");
    if (params && req.method === "GET") {
      requireMerchant(req, config);
      return sendJson(res, 200, { order: await orderService.getOrder(params.id) });
    }

    params = getPathParams(pathname, "/api/orders/:id/confirm");
    if (params && req.method === "POST") {
      requireAdmin(req, config);
      const body = await readJson(req);
      const order = await orderService.confirmPaid(params.id, body, actorFrom(req));
      return sendJson(res, 200, { order });
    }

    params = getPathParams(pathname, "/api/orders/:id/cancel");
    if (params && req.method === "POST") {
      requireAdmin(req, config);
      const body = await readJson(req);
      const order = await orderService.cancelOrder(params.id, body, actorFrom(req));
      return sendJson(res, 200, { order });
    }

    if (req.method === "POST" && pathname === "/api/providers/simulate/notify") {
      requireBearer(req, config.simulateProviderToken, "SIMULATE_PROVIDER_TOKEN");
      const body = await readJson(req);
      const order = await orderService.simulateProviderNotify(body, { ...actorFrom(req), actorType: "simulate_provider" });
      return sendJson(res, 200, { order });
    }

    if (req.method === "GET" && pathname === "/api/audit-logs") {
      requireAdmin(req, config);
      return sendJson(res, 200, { auditLogs: await orderService.listAuditLogs() });
    }

    if (req.method === "GET" && pathname === "/api/webhook-deliveries") {
      requireAdmin(req, config);
      return sendJson(res, 200, { deliveries: await orderService.listDeliveries() });
    }

    params = getPathParams(pathname, "/pay/:token");
    if (params && req.method === "GET") {
      return sendStaticFile(res, "pay.html");
    }

    if (req.method === "GET" && !pathname.startsWith("/api/")) {
      return sendStatic(req, res, pathname);
    }

    return notFound(res);
  };
}
