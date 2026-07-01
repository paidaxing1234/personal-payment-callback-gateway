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
    WEBHOOK_SECRET: "test-webhook-secret",
    ALLOW_PRIVATE_WEBHOOKS: "true"
  });
  const baseUrl = await listen(app);

  const create = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
