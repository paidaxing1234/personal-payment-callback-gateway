# 合规边界说明

## 结论

截至 2026-07-01，普通个人支付宝 App 收款码或个人静态收款码没有官方异步通知回调能力。支付宝官方异步通知依赖开放平台支付产品的商户订单流程，通常由商家调用支付接口时传入 `notify_url`，支付宝再按订单状态向该地址 POST 通知。

## 推荐路线

生产收款应使用官方支付产品：

- 当面付：适合线下扫码，商户服务端创建订单二维码。
- 电脑网站支付、手机网站支付、APP 支付、小程序支付：适合线上场景。
- `alipay.trade.query`：用于主动查询支付状态。
- 账单下载接口：用于对账和差错处理。

## 个人码场景

个人码只在本项目中作为“人工核验到账”的收款说明载体。系统可以帮助你记录订单、人工确认、发送签名 Webhook 和审计留痕，但不能证明支付宝已经通过官方接口确认支付成功。

## 明确不支持

- 支付宝客户端自动化。
- 抓包、读取账号密码、cookie 或私钥。
- 通过无障碍服务自动点击。
- 二维码池、代收代付、跑分、远程非面对面收款。
- 宣称“个人码免签回调”“个人码官方回调”“自动到账即发货”。

## 可引用资料

- 支付宝开放平台异步通知说明：https://opendocs.alipay.com/open/064jha
- `alipay.trade.precreate` 公共参数 `notify_url`：https://opendocs.alipay.com/open/02ekfg
- 支付宝当面付快速接入：https://opendocs.alipay.com/open/05osuz
- Android `NotificationListenerService` 说明：https://developer.android.com/reference/android/service/notification/NotificationListenerService
