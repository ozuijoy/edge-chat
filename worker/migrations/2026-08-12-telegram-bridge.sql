CREATE TABLE messages_with_external_senders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  sender_id INTEGER,
  content TEXT NOT NULL DEFAULT '',
  attachment_key TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  attachment_size INTEGER,
  sender_kind TEXT NOT NULL DEFAULT 'local' CHECK (sender_kind IN ('local', 'external')),
  external_sender_id TEXT,
  external_sender_name TEXT,
  external_sender_avatar_url TEXT,
  source TEXT NOT NULL DEFAULT 'edgechat',
  source_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  CHECK (
    (sender_kind = 'local' AND sender_id IS NOT NULL)
    OR (sender_kind = 'external' AND sender_id IS NULL)
  ),
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

INSERT INTO messages_with_external_senders (
  id, channel_id, sender_id, content, attachment_key, attachment_name,
  attachment_type, attachment_size, sender_kind, source, created_at, deleted_at
)
SELECT
  id, channel_id, sender_id, content, attachment_key, attachment_name,
  attachment_type, attachment_size, 'local', 'edgechat', created_at, deleted_at
FROM messages;

DROP TABLE messages;
ALTER TABLE messages_with_external_senders RENAME TO messages;

CREATE INDEX idx_messages_channel_created
  ON messages(channel_id, id DESC);

CREATE INDEX idx_messages_sender_created
  ON messages(sender_id, id DESC);

CREATE UNIQUE INDEX idx_messages_external_source
  ON messages(source, source_message_id)
  WHERE source_message_id IS NOT NULL;

CREATE TABLE telegram_bridge_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bot_token_ciphertext TEXT NOT NULL,
  webhook_secret_ciphertext TEXT NOT NULL,
  bot_username TEXT NOT NULL DEFAULT '',
  webhook_url TEXT NOT NULL DEFAULT '',
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE telegram_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL UNIQUE,
  telegram_chat_id TEXT NOT NULL UNIQUE,
  telegram_chat_title TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_telegram_mappings_channel
  ON telegram_mappings(channel_id, enabled, id);
