DROP INDEX IF EXISTS idx_messages_client_message;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_channel_client_message
  ON messages(channel_id, sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS message_event_compaction (
  channel_id INTEGER PRIMARY KEY,
  compacted_through INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);
