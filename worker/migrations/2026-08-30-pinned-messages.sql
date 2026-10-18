CREATE TABLE IF NOT EXISTS channel_pins (
  channel_id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL UNIQUE,
  pinned_by INTEGER,
  pinned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 软删除后立即移除置顶引用；消息保留期仍由 GC 独立决定，不因置顶而延长。
CREATE TRIGGER IF NOT EXISTS clear_pin_after_message_soft_delete
AFTER UPDATE OF deleted_at ON messages
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  DELETE FROM channel_pins WHERE message_id = NEW.id;
END;
