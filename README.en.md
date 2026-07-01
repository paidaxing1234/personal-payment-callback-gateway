# Personal Payment Callback Gateway

Language: [简体中文](./README.md) | English

This is a compliance-first helper for payment bookkeeping: create orders, manually confirm received payments, keep audit logs, and forward signed webhooks to your business system.

> Important boundary: this project does not provide or claim official asynchronous callbacks for personal Alipay collection codes. Production payments should use official Alipay Open Platform payment products. A personal static collection code can only be treated as a manual bookkeeping aid here.

## What It Does

- Creates pending payment orders.
- Provides a public `/pay/<token>` checkout page with amount, order number, and manual collection instructions.
- Lets an administrator manually confirm a payment after independent verification.
- Sends signed HMAC-SHA256 webhooks to a merchant system.
- Stores payment events, webhook deliveries, and audit logs.
- Provides a minimal admin UI, REST API, compliance notes, and tests.

## What It Does Not Do

- It does not turn a personal Alipay App collection code into an official `notify_url`.
- It does not implement client automation, packet capture, cookie extraction, accessibility clicks, QR-code pools, proxy collection, or unofficial payment channels.
- It does not treat Android notifications as proof of payment success.

## Quick Start

```bash
cp .env.example .env
npm test
npm start
```

Default endpoints:

- Admin UI: http://127.0.0.1:8787/
- Health check: http://127.0.0.1:8787/health
- Compliance boundary: http://127.0.0.1:8787/api/compliance

All manual confirmation, cancellation, and audit APIs require a strong random `ADMIN_TOKEN`. Production deployments must also use a strong random `WEBHOOK_SECRET` and expose the service only behind HTTPS.
Order creation and read APIs require a strong random `MERCHANT_TOKEN`; do not expose the merchant API as an unauthenticated public endpoint.

## Webhook Signature

Merchant webhooks include:

- `X-Callback-Event-Id`
- `X-Callback-Idempotency-Key`
- `X-Callback-Timestamp`
- `X-Callback-Nonce`
- `X-Callback-Signature`

Signature:

```text
HMAC_SHA256(WEBHOOK_SECRET, timestamp + "." + nonce + "." + rawBody)
```

The merchant side should validate the time window, nonce, signature, and idempotency key before fulfilling anything.

## Production Recommendation

For real automatic payment callbacks, use official payment products, verify official notifications, query order status as a fallback, and reconcile against official bills.
