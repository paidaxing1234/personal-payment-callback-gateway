import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../src/server.js";
import { signWebhookBody } from "../src/webhook/signature.js";

let app;
let baseUrl;
let receivedWebhook;
let webhookServer;
let webhookUrl;

async function listen(server, host = "127.0.0.1") {
  await new Promise((resolve) => server.listen(0, host, resolve));
  const address = server.address();
  return `http://${address.address}:${address.port}`;
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  return { response, body };
}

before(async () => {
  webhookServer = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");
    receivedWebhook = {
      rawBody,
      body: JSON.parse(rawBody),
      headers: req.headers
    };
    res.writeHead(204);
    res.end();
  });
  webhookUrl = await listen(webhookServer);

  app = await createApp({
    NODE_ENV: "test",
    DATA_FILE: path.join(os.tmpdir(), `pcg-test-${Date.now()}.json`),
    ADMIN_TOKEN: "admin-test-token",
    WEBHOOK_SECRET: "test-webhook-secret",
    SIMULATE_PROVIDER_TOKEN: "simulate-test-token",
    ALLOW_PRIVATE_WEBHOOKS: "true"
  });
  baseUrl = await listen(app);
});

after(async () => {
  await new Promise((resolve) => app.close(resolve));
  await new Promise((resolve) => webhookServer.close(resolve));
});

test("creates an order and confirms it with signed webhook delivery", async () => {
  const create = await request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ amount: "12.34", subject: "Node test order", webhookUrl })
  });
  assert.equal(create.response.status, 201);
  assert.equal(create.body.order.amountCents, 1234);
  assert.equal(create.body.order.status, "PENDING_PAYMENT");

  const confirm = await request(`/api/orders/${create.body.order.id}/confirm`, {
    method: "POST",
    headers: { Authorization: "Bearer admin-test-token" },
    body: JSON.stringify({ amount: "12.34", note: "paid" })
  });
  assert.equal(confirm.response.status, 200);
  assert.equal(confirm.body.order.status, "WEBHOOK_DELIVERED");

  assert.equal(receivedWebhook.body.eventType, "payment.confirmed");
  assert.equal(receivedWebhook.body.order.orderNo, create.body.order.orderNo);
  const expected = signWebhookBody(
    "test-webhook-secret",
    receivedWebhook.headers["x-callback-timestamp"],
    receivedWebhook.headers["x-callback-nonce"],
    receivedWebhook.rawBody
  );
  assert.equal(receivedWebhook.headers["x-callback-signature"], expected);
});

test("rejects private webhook URLs unless explicitly enabled", async () => {
  const isolated = await createApp({
    NODE_ENV: "test",
    DATA_FILE: path.join(os.tmpdir(), `pcg-private-test-${Date.now()}.json`),
    ADMIN_TOKEN: "admin-test-token",
    WEBHOOK_SECRET: "test-webhook-secret",
    ALLOW_PRIVATE_WEBHOOKS: "false"
  });
  const isolatedBase = await listen(isolated);
  const response = await fetch(`${isolatedBase}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: "1.00", subject: "Blocked", webhookUrl: "http://127.0.0.1:9/hook" })
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error.code, "private_webhook_url_blocked");
  await new Promise((resolve) => isolated.close(resolve));
});

test("simulate provider endpoint requires its own token", async () => {
  const create = await request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ amount: "3.00", subject: "Simulate" })
  });

  const rejected = await request("/api/providers/simulate/notify", {
    method: "POST",
    body: JSON.stringify({ orderId: create.body.order.id, amount: "3.00" })
  });
  assert.equal(rejected.response.status, 401);

  const accepted = await request("/api/providers/simulate/notify", {
    method: "POST",
    headers: { Authorization: "Bearer simulate-test-token" },
    body: JSON.stringify({ orderId: create.body.order.id, amount: "3.00" })
  });
  assert.equal(accepted.response.status, 200);
  assert.match(accepted.body.order.status, /PAID_MANUAL_CONFIRMED|WEBHOOK_DELIVERED/);
});
