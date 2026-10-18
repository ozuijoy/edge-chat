CREATE TABLE telegram_notification_users (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  telegram_chat_id TEXT UNIQUE,
  telegram_name TEXT NOT NULL DEFAULT '',
  pending_token_hash TEXT UNIQUE,
  pending_expires_at TEXT,
  dm_enabled INTEGER NOT NULL DEFAULT 1 CHECK (dm_enabled IN (0, 1)),
  mention_enabled INTEGER NOT NULL DEFAULT 1 CHECK (mention_enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE telegram_notification_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('dm', 'mention')),
  room_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, channel_id, message_id)
);

CREATE INDEX idx_telegram_notification_due ON telegram_notification_outbox(status, next_attempt_at);
