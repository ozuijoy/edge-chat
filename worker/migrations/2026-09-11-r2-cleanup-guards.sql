CREATE INDEX IF NOT EXISTS idx_gc_uploaded_created
ON uploaded_files(created_at, object_key);

CREATE INDEX IF NOT EXISTS idx_gc_message_attachment
ON messages(attachment_key)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_gc_user_avatar
ON users(avatar_key)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_gc_channel_avatar
ON channels(avatar_key)
WHERE deleted_at IS NULL;

-- 待删除占位与资源引用写入必须由同一条数据库语句仲裁，避免校验后写入竞态。
CREATE TRIGGER IF NOT EXISTS prevent_pending_message_attachment_insert
BEFORE INSERT ON messages
WHEN NEW.attachment_key IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pending_r2_delete
    WHERE object_key = NEW.attachment_key
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_object_pending_delete');
END;

CREATE TRIGGER IF NOT EXISTS prevent_pending_message_attachment_update
BEFORE UPDATE OF attachment_key ON messages
WHEN NEW.attachment_key IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pending_r2_delete
    WHERE object_key = NEW.attachment_key
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_object_pending_delete');
END;

CREATE TRIGGER IF NOT EXISTS prevent_pending_user_avatar_insert
BEFORE INSERT ON users
WHEN NEW.avatar_key IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pending_r2_delete
    WHERE object_key = NEW.avatar_key
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_object_pending_delete');
END;

CREATE TRIGGER IF NOT EXISTS prevent_pending_user_avatar_update
BEFORE UPDATE OF avatar_key ON users
WHEN NEW.avatar_key IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pending_r2_delete
    WHERE object_key = NEW.avatar_key
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_object_pending_delete');
END;

CREATE TRIGGER IF NOT EXISTS prevent_pending_channel_avatar_insert
BEFORE INSERT ON channels
WHEN NEW.avatar_key IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pending_r2_delete
    WHERE object_key = NEW.avatar_key
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_object_pending_delete');
END;

CREATE TRIGGER IF NOT EXISTS prevent_pending_channel_avatar_update
BEFORE UPDATE OF avatar_key ON channels
WHEN NEW.avatar_key IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pending_r2_delete
    WHERE object_key = NEW.avatar_key
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_object_pending_delete');
END;
