# Telegram 私人通知运行规则

私人通知只提示私信或明确群提及，不携带消息正文。通知预算不会阻止聊天消息提交，也不改变房间授权、拉黑、有效提及和收件人偏好。

## 预算与合并

- 滚动一分钟最多入队：同一发送者 20 条、同一收件人 5 条、全站 100 条。
- 同一消息最多通知 10 位已连接收件人；全站待处理/发送中记录最多 500 条。超额提醒不入队，不积累稍后补发的洪峰。
- 入队延迟 10 秒，同一收件人、同一提醒类型的到期任务合并；多个会话仅给出会话数量。每个收件人最多每分钟收到一次私人提醒。
- 全站私人提醒及重试最多每秒发起一次 Bot 请求。429 使用 Telegram 的 `parameters.retry_after` 暂停整个私人通知队列；缺少该值时暂停 60 秒。普通失败按尝试次数退避，每条记录最多尝试四次。
- D1 保存预算、租约和共享退避；`TelegramNotifications` DO alarm 调度，既有 15 分钟 cron 只唤醒队列并记录 pending/sending/failed 汇总。终态去重键保留七天后清理。

上述预算针对私人提醒，不是 Telegram 群组桥接的流量预算；共享 Bot 的其他 API 使用仍可能触发上游限额。多人共同滥用仍可能消耗全站预算，部署者应结合账号管理与队列日志观察。

## 升级与手动部署

GitHub Actions 从 `wrangler.example.toml` 生成配置，自动规划、应用和验证迁移后部署。无需新 Secret。已有数据库保留绑定、偏好和 outbox，新增预算字段、索引和单行闸门。

手动部署先备份 D1，使用现有迁移规划脚本执行 `2026-10-11-telegram-notification-budgets`，再运行 `--verify`。不要对已有数据库只重跑完整 schema，也不要重放已经登记的历史迁移。自定义 Wrangler 配置必须增加：

```toml
[[durable_objects.bindings]]
name = "TELEGRAM_NOTIFICATIONS"
class_name = "TelegramNotifications"

[[migrations]]
tag = "v5"
new_sqlite_classes = ["TelegramNotifications"]
```

保留现有 v1-v4 迁移和绑定。后台「安装与维护」包含新 DO 的只读健康检查；检查不触发通知或 alarm。
