# Telegram 私人通知運行規則

私人通知只提示私信或明確群提及，不攜帶消息正文。通知預算不會阻止聊天消息提交，也不改變房間授權、拉黑、有效提及和收件人偏好。

## 預算與合併

- 滾動一分鐘最多入隊：同一發送者 20 條、同一收件人 5 條、全站 100 條。
- 同一消息最多通知 10 位已連接收件人；全站待處理/發送中記錄最多 500 條。超額提醒不入隊，不積累稍後補發的洪峰。
- 入隊延遲 10 秒，同一收件人、同一提醒類型的到期任務合併；多個會話僅給出會話數量。每個收件人最多每分鐘收到一次私人提醒。
- 全站私人提醒及重試最多每秒發起一次 Bot 請求。429 使用 Telegram 的 `parameters.retry_after` 暫停整個私人通知隊列；缺少該值時暫停 60 秒。普通失敗按嘗試次數退避，每條記錄最多嘗試四次。
- D1 保存預算、租約和共享退避；`TelegramNotifications` DO alarm 調度，既有 15 分鐘 cron 只喚醒隊列並記錄 pending/sending/failed 彙總。終態去重鍵保留七天後清理。

上述預算針對私人提醒，不是 Telegram 群組橋接的流量預算；共享 Bot 的其他 API 使用仍可能觸發上游限額。多人共同濫用仍可能消耗全站預算，部署者應結合賬號管理與隊列日誌觀察。

## 升級與手動部署

GitHub Actions 從 `wrangler.example.toml` 生成配置，自動規劃、應用和驗證遷移後部署。無需新 Secret。已有數據庫保留綁定、偏好和 outbox，新增預算字段、索引和單行閘門。

手動部署先備份 D1，使用現有遷移規劃腳本執行 `2026-10-11-telegram-notification-budgets`，再運行 `--verify`。不要對已有數據庫只重跑完整 schema，也不要重放已經登記的歷史遷移。自定義 Wrangler 配置必須增加：

```toml
[[durable_objects.bindings]]
name = "TELEGRAM_NOTIFICATIONS"
class_name = "TelegramNotifications"

[[migrations]]
tag = "v5"
new_sqlite_classes = ["TelegramNotifications"]
```

保留現有 v1-v4 遷移和綁定。後臺「安裝與維護」包含新 DO 的只讀健康檢查；檢查不觸發通知或 alarm。
