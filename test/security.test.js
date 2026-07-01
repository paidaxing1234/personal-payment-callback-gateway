import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createApp } from "../src/server.js";

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return `http://${address.address}:${address.port}`;
}

test("admin operations require ADMIN_TOKEN even outside production", async () => {
  const app = await createApp({
    NODE_ENV: "development",
    DATA_FILE: path.join(os.tmpdir(), `pcg-no-admin-${Date.now()}.json`),
    MERCHANT_TOKEN: "merchant-token",
    WEBHOOK_SECRET: "test-webhook-secret",
    ALLOW_PRIVATE_WEBHOOKS: "true"
  });
  const baseUrl = await listen(app);

  const create = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer merchant-token" },
    body: JSON.stringify({ amount: "1.00", subject: "Needs admin token" })
  });
  const createdBody = await create.json();
  assert.equal(create.status, 201);

  const confirm = await fetch(`${baseUrl}/api/orders/${createdBody.order.id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: "1.00" })
  });
  const confirmBody = await confirm.json();
  assert.equal(confirm.status, 403);
  assert.equal(confirmBody.error.code, "admin_token_required");

  await new Promise((resolve) => app.close(resolve));
});

test("order list and details require admin token", async () => {
  const app = await createApp({
    NODE_ENV: "test",
    DATA_FILE: path.join(os.tmpdir(), `pcg-list-admin-${Date.now()}.json`),
    ADMIN_TOKEN: "list-admin-token",
    MERCHANT_TOKEN: "list-merchant-token",
    WEBHOOK_SECRET: "test-webhook-secret",
    ALLOW_PRIVATE_WEBHOOKS: "true"
  });
  const baseUrl = await listen(app);

  const create = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer list-merchant-token" },
    body: JSON.stringify({ amount: "1.00", subject: "Private order list" })
  });
  const createdBody = await create.json();

  const list = await fetch(`${baseUrl}/api/orders`);
  assert.equal(list.status, 401);

  const detail = await fetch(`${baseUrl}/api/orders/${createdBody.order.id}`);
  assert.equal(detail.status, 401);

  const authedList = await fetch(`${baseUrl}/api/orders`, {
    headers: { Authorization: "Bearer list-merchant-token" }
  });
  assert.equal(authedList.status, 200);

  await new Promise((resolve) => app.close(resolve));
});

test("oversized JSON bodies are rejected", async () => {
  const app = await createApp({
    NODE_ENV: "test",
    DATA_FILE: path.join(os.tmpdir(), `pcg-large-body-${Date.now()}.json`),
    ADMIN_TOKEN: "large-admin-token",
    MERCHANT_TOKEN: "large-merchant-token",
    WEBHOOK_SECRET: "test-webhook-secret"
  });
  const baseUrl = await listen(app);

  const response = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer large-merchant-token" },
    body: JSON.stringify({ amount: "1.00", subject: "x".repeat(1024 * 1024 + 1) })
  });
  const body = await response.json();
  assert.equal(response.status, 413);
  assert.equal(body.error.code, "payload_too_large");

  await new Promise((resolve) => app.close(resolve));
});

test("store queue recovers after a failed update", async () => {
  const app = await createApp({
    NODE_ENV: "test",
    DATA_FILE: path.join(os.tmpdir(), `pcg-queue-${Date.now()}.json`),
    ADMIN_TOKEN: "queue-admin-token",
    MERCHANT_TOKEN: "queue-merchant-token",
    WEBHOOK_SECRET: "test-webhook-secret"
  });
  const baseUrl = await listen(app);

  const missing = await fetch(`${baseUrl}/api/orders/not-real/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer queue-admin-token" },
    body: JSON.stringify({ reason: "missing" })
  });
  assert.equal(missing.status, 404);

  const create = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer queue-merchant-token" },
    body: JSON.stringify({ amount: "2.00", subject: "Queue recovered" })
  });
  assert.equal(create.status, 201);

  await new Promise((resolve) => app.close(resolve));
});

test("production requires WEBHOOK_SECRET", async () => {
  await assert.rejects(
    () =>
      createApp({
        NODE_ENV: "production",
        DATA_FILE: path.join(os.tmpdir(), `pcg-prod-secret-${Date.now()}.json`),
        ADMIN_TOKEN: "prod-admin-token",
        MERCHANT_TOKEN: "prod-merchant-token"
      }),
    /WEBHOOK_SECRET must be configured/
  );
});

test("merchant API requires MERCHANT_TOKEN", async () => {
  const app = await createApp({
    NODE_ENV: "test",
    DATA_FILE: path.join(os.tmpdir(), `pcg-no-merchant-${Date.now()}.json`),
    ADMIN_TOKEN: "admin-token",
    WEBHOOK_SECRET: "test-webhook-secret"
  });
  const baseUrl = await listen(app);

  const response = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: "1.00", subject: "Needs merchant token" })
  });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error.code, "merchant_token_required");

  await new Promise((resolve) => app.close(resolve));
});

test("production rejects example placeholder secrets", async () => {
  await assert.rejects(
    () =>
      createApp({
        NODE_ENV: "production",
        DATA_FILE: path.join(os.tmpdir(), `pcg-prod-placeholder-${Date.now()}.json`),
        ADMIN_TOKEN: "change-this-long-random-admin-token",
        MERCHANT_TOKEN: "prod-merchant-token",
        WEBHOOK_SECRET: "prod-webhook-secret"
      }),
    /ADMIN_TOKEN must not use an example placeholder/
  );
});
