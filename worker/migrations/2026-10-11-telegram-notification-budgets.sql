-- 保留旧投递与绑定，只补入队预算索引和共享退避闸门，升级不丢失用户提醒。
ALTER TABLE telegram_notification_users ADD COLUMN next_notification_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
ALTER TABLE telegram_notification_outbox ADD COLUMN sender_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_notification_outbox ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
UPDATE telegram_notification_outbox SET created_at = updated_at;
CREATE INDEX IF NOT EXISTS idx_telegram_notification_sender ON telegram_notification_outbox(sender_id, created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_notification_recipient ON telegram_notification_outbox(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_notification_created ON telegram_notification_outbox(created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_notification_message ON telegram_notification_outbox(channel_id, message_id);
CREATE TABLE IF NOT EXISTS telegram_notification_gate (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_send_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'
);
INSERT OR IGNORE INTO telegram_notification_gate (id) VALUES (1);
