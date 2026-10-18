ALTER TABLE messages ADD COLUMN bridge_binding_id TEXT;
ALTER TABLE messages ADD COLUMN bridge_event_id TEXT;
ALTER TABLE messages ADD COLUMN bridge_sent_at INTEGER;
ALTER TABLE messages ADD COLUMN source_instance TEXT;
ALTER TABLE messages ADD COLUMN bridge_target_revision INTEGER;

CREATE TABLE IF NOT EXISTS bridge_instance (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  instance_id TEXT NOT NULL UNIQUE,
  origin TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS instance_bindings (
  id TEXT PRIMARY KEY,
  channel_id INTEGER NOT NULL,
  channel_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('inviter', 'joiner')),
  status TEXT NOT NULL CHECK (status IN ('invited', 'claiming', 'pending', 'activating', 'active', 'revoked')),
  secret TEXT NOT NULL,
  invitation_secret TEXT NOT NULL DEFAULT '',
  peer_instance_id TEXT,
  peer_origin TEXT,
  peer_channel_id INTEGER,
  peer_channel_name TEXT,
  claim_id TEXT,
  expires_at INTEGER NOT NULL,
  local_paused INTEGER NOT NULL DEFAULT 0 CHECK (local_paused IN (0, 1)),
  peer_paused INTEGER NOT NULL DEFAULT 0 CHECK (peer_paused IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0,
  peer_revision INTEGER NOT NULL DEFAULT -1,
  control_pending INTEGER NOT NULL DEFAULT 0,
  control_attempts INTEGER NOT NULL DEFAULT 0,
  control_next_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  last_error TEXT,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  discarded_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_instance_bindings_channel
  ON instance_bindings(channel_id) WHERE status != 'revoked';
CREATE INDEX IF NOT EXISTS idx_instance_bindings_control
  ON instance_bindings(control_next_at) WHERE control_pending = 1;

CREATE TRIGGER IF NOT EXISTS validate_instance_binding_group
BEFORE INSERT ON instance_bindings
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM channels
    WHERE id = NEW.channel_id AND kind IN ('public', 'private') AND deleted_at IS NULL)
    THEN RAISE(ABORT, 'BRIDGE_GROUP_REQUIRED') END;
END;

CREATE TABLE IF NOT EXISTS bridge_outbox (
  binding_id TEXT NOT NULL REFERENCES instance_bindings(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  expires_at INTEGER NOT NULL DEFAULT ((unixepoch() + 86400) * 1000),
  next_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (binding_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_bridge_outbox_due ON bridge_outbox(next_at, binding_id);

CREATE TABLE IF NOT EXISTS bridge_receipts (
  binding_id TEXT NOT NULL REFERENCES instance_bindings(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (binding_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_bridge_receipts_expiry ON bridge_receipts(expires_at);

-- 在真实 INSERT 事务内登记，HTTP/WS/移动 API 都不会遗漏，也不会把旧历史补入队列。
CREATE TRIGGER IF NOT EXISTS enqueue_instance_bridge_message
AFTER INSERT ON messages
WHEN NEW.sender_kind = 'local' AND NEW.source = 'edgechat'
  AND NEW.attachment_key IS NULL AND NEW.deleted_at IS NULL
BEGIN
  UPDATE instance_bindings SET discarded_count = discarded_count + 1, last_error = 'queue_full'
  WHERE channel_id = NEW.channel_id AND status = 'active' AND local_paused = 0 AND peer_paused = 0
    AND (SELECT COUNT(*) FROM bridge_outbox WHERE binding_id = instance_bindings.id) >= 1000;
  INSERT INTO bridge_outbox (binding_id, event_id, message_id, sender_id, sender_name, content, target_revision)
  SELECT b.id, lower(hex(randomblob(16))), NEW.id, NEW.sender_id, u.display_name, NEW.content, b.peer_revision
  FROM instance_bindings b JOIN users u ON u.id = NEW.sender_id
  WHERE b.channel_id = NEW.channel_id AND b.status = 'active' AND b.local_paused = 0 AND b.peer_paused = 0
    AND (SELECT COUNT(*) FROM bridge_outbox WHERE binding_id = b.id) < 1000;
END;

-- 接收资格与 receipt 在消息事务中确认，封堵暂停/解绑/重复请求的先查后写竞态。
CREATE TRIGGER IF NOT EXISTS validate_instance_bridge_message
BEFORE INSERT ON messages WHEN NEW.source = 'instance-bridge'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM instance_bindings b JOIN channels c ON c.id = b.channel_id
    WHERE b.id = NEW.bridge_binding_id AND b.channel_id = NEW.channel_id
      AND b.status = 'active' AND b.local_paused = 0 AND b.peer_paused = 0
      AND c.deleted_at IS NULL AND c.kind IN ('public', 'private')
      AND NEW.sender_kind = 'external' AND NEW.attachment_key IS NULL
      AND NEW.bridge_event_id IS NOT NULL
      AND NEW.bridge_target_revision = b.revision
      AND NEW.bridge_sent_at BETWEEN (unixepoch() - 86400) * 1000 AND (unixepoch() + 300) * 1000
  ) THEN RAISE(ABORT, 'BRIDGE_NOT_RECEIVING') END;
  INSERT INTO bridge_receipts (binding_id, event_id, expires_at)
  VALUES (NEW.bridge_binding_id, NEW.bridge_event_id, NEW.bridge_sent_at + 172800000);
END;

-- generation 变更与清空积压同事务；并发重复控制不能再清掉之后产生的新消息。
CREATE TRIGGER IF NOT EXISTS cancel_instance_bridge_generation
AFTER UPDATE OF revision, peer_revision, status ON instance_bindings
WHEN NEW.revision != OLD.revision OR NEW.peer_revision != OLD.peer_revision OR NEW.status = 'revoked'
BEGIN
  UPDATE instance_bindings SET discarded_count = discarded_count +
    (SELECT COUNT(*) FROM bridge_outbox WHERE binding_id = NEW.id) WHERE id = NEW.id;
  DELETE FROM bridge_outbox WHERE binding_id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS cancel_instance_bridge_deleted_message
AFTER UPDATE OF deleted_at ON messages WHEN NEW.deleted_at IS NOT NULL
BEGIN
  UPDATE instance_bindings SET discarded_count = discarded_count + 1
    WHERE id IN (SELECT binding_id FROM bridge_outbox WHERE message_id = NEW.id);
  DELETE FROM bridge_outbox WHERE message_id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS count_instance_bridge_deleted_message
BEFORE DELETE ON messages
BEGIN
  UPDATE instance_bindings SET discarded_count = discarded_count + 1
    WHERE id IN (SELECT binding_id FROM bridge_outbox WHERE message_id = OLD.id);
END;

CREATE TRIGGER IF NOT EXISTS revoke_instance_bridge_deleted_channel
BEFORE DELETE ON channels
BEGIN
  UPDATE instance_bindings
  SET status = 'revoked', revision = revision + 1, control_pending = (peer_origin IS NOT NULL),
    control_next_at = unixepoch() * 1000, updated_at = unixepoch() * 1000
  WHERE channel_id = OLD.id AND status != 'revoked';
  DELETE FROM bridge_outbox WHERE binding_id IN (SELECT id FROM instance_bindings WHERE channel_id = OLD.id);
END;

CREATE TRIGGER IF NOT EXISTS revoke_instance_bridge_soft_deleted_channel
AFTER UPDATE OF deleted_at, kind ON channels
WHEN NEW.deleted_at IS NOT NULL OR NEW.kind = 'dm'
BEGIN
  UPDATE instance_bindings
  SET status = 'revoked', revision = revision + 1, control_pending = (peer_origin IS NOT NULL),
    control_next_at = unixepoch() * 1000, updated_at = unixepoch() * 1000
  WHERE channel_id = NEW.id AND status != 'revoked';
  DELETE FROM bridge_outbox WHERE binding_id IN (SELECT id FROM instance_bindings WHERE channel_id = NEW.id);
END;
