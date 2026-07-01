# Personal Payment Callback Gateway

语言：[简体中文](./README.md) | [English](./README.en.md)

一个合规优先的个人收款辅助系统：用于创建订单、人工核验到账、审计留痕，并向你的业务系统发送签名 Webhook。

> 重要边界：本项目不提供、也不宣称支付宝个人收款码具备官方异步回调能力。生产收款请使用支付宝开放平台官方支付产品，例如当面付、电脑网站支付、手机网站支付、APP 支付或小程序支付。个人静态收款码场景只适合人工核验和账务记录，不应被包装成“免签支付”或“自动回调通道”。

## 能做什么

- 创建待支付订单，并生成可展示给付款人的收款说明。
- 管理员人工确认到账，系统记录审计日志。
- 模拟 provider 通知，用于本地开发和商户 Webhook 联调。
- 对外发送 HMAC-SHA256 签名 Webhook，支持幂等键和投递记录。
- 提供最小管理页面、REST API、合规说明和测试。
- 采用类似支付网关的 `MERCHANT_TOKEN` / `ADMIN_TOKEN` 双令牌边界。

## 不能做什么

- 不能把个人支付宝 App 收款码变成官方 `notify_url`。
- 不提供支付宝客户端自动化、抓包、读取账号 cookie、无障碍点击、二维码池、代收代付或远程经营收款能力。
- 不把 Android 通知监听当作支付成功依据；通知最多只能作为本人本机的账务提醒辅助。

## 快速启动

```bash
cp .env.example .env
npm test
npm run security:scan
npm start
```

默认地址：

- 管理页面：http://127.0.0.1:8787/
- 健康检查：http://127.0.0.1:8787/health
- 合规边界：http://127.0.0.1:8787/api/compliance

所有人工确认、取消和审计查询都必须设置强随机 `ADMIN_TOKEN`；生产环境还必须设置强随机 `WEBHOOK_SECRET`，并通过 HTTPS 暴露服务。
创建和读取订单 API 需要设置强随机 `MERCHANT_TOKEN`，不要把下单接口暴露成无鉴权公开接口。

## API 摘要

### 创建订单

```bash
curl -X POST http://127.0.0.1:8787/api/orders \
  -H "Authorization: Bearer <MERCHANT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"amount\":\"9.90\",\"subject\":\"测试订单\",\"webhookUrl\":\"https://example.com/webhook\"}"
```

### 人工确认到账

```bash
curl -X POST http://127.0.0.1:8787/api/orders/<orderId>/confirm \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"note\":\"已人工核验到账\"}"
```

### 模拟 provider 通知

```bash
curl -X POST http://127.0.0.1:8787/api/providers/simulate/notify \
  -H "Authorization: Bearer <SIMULATE_PROVIDER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"orderId\":\"<orderId>\",\"amount\":\"9.90\"}"
```

## Webhook 签名

商户 Webhook 会收到 JSON 事件，并带上以下请求头：

- `X-Callback-Event-Id`
- `X-Callback-Idempotency-Key`
- `X-Callback-Timestamp`
- `X-Callback-Nonce`
- `X-Callback-Signature`

签名算法：

```text
HMAC_SHA256(WEBHOOK_SECRET, timestamp + "." + nonce + "." + rawBody)
```

商户侧应校验时间窗口、nonce、签名和 `idempotencyKey`，避免重放与重复发货。

## 合规接入建议

支付宝官方异步通知来自商家调用支付接口时传入的 `notify_url`，例如 `alipay.trade.precreate`。如果需要真实自动支付回调，应申请并签约支付宝开放平台支付产品，并在服务端验签异步通知、主动查询订单、下载账单对账。

个人收款码模式建议只用于本人低频、面对面场景的人工确认；如果具有明显经营活动特征，应按监管和平台要求使用经营/商家收款码或官方商户支付产品。

第三方网关例如迅虎支付/虎皮椒的公开文档展示的是“平台开户、商户下单、平台回调商户 `notify_url`”模式，不等同于普通个人静态收款码自带官方回调。详见 [docs/xunhupay-model.md](./docs/xunhupay-model.md)。

## 开发命令

```bash
npm test
npm run check
npm run security:scan
npm start
```

## 目录

```text
src/
  api/            HTTP 路由
  config/         配置读取
  domain/         订单状态机
  lib/            通用工具
  storage/        JSON 存储
  webhook/        Webhook 签名与投递
public/           管理页面
docs/             合规、架构、发布文档
test/             Node.js 内置测试
```
