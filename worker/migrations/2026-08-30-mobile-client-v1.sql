ALTER TABLE messages ADD COLUMN client_message_id TEXT;
ALTER TABLE uploaded_files ADD COLUMN client_upload_id TEXT;

CREATE TABLE IF NOT EXISTS device_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  installation_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  app_version TEXT NOT NULL DEFAULT '',
  refresh_token_hash TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS realtime_tickets (
  token_hash TEXT PRIMARY KEY,
  access_token_ciphertext TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  device_session_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('room', 'inbox')),
  room_kind TEXT CHECK (room_kind IN ('public', 'private', 'dm')),
  room_id INTEGER,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (device_session_id) REFERENCES device_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_message
  ON messages(sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_uploaded_files_client_upload
  ON uploaded_files(owner_user_id, client_upload_id)
  WHERE client_upload_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_sessions_refresh_token
  ON device_sessions(refresh_token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_sessions_user_installation_active
  ON device_sessions(user_id, installation_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_device_sessions_user_active
  ON device_sessions(user_id, revoked_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_realtime_tickets_expiry
  ON realtime_tickets(expires_at, consumed_at);

CREATE INDEX IF NOT EXISTS idx_message_events_channel_sequence
  ON message_events(channel_id, sequence);

-- 触发器让所有现有提交路径自动进入同一个同步事件流，不要求调用者额外记账。
CREATE TRIGGER IF NOT EXISTS record_message_created_event
AFTER INSERT ON messages
BEGIN
  INSERT INTO message_events (channel_id, message_id, event_type)
  VALUES (NEW.channel_id, NEW.id, 'created');
END;

CREATE TRIGGER IF NOT EXISTS record_message_deleted_event
AFTER UPDATE OF deleted_at ON messages
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  INSERT INTO message_events (channel_id, message_id, event_type)
  VALUES (NEW.channel_id, NEW.id, 'deleted');
END;
