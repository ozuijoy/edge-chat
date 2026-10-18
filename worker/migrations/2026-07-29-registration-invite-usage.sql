PRAGMA foreign_keys = ON;

ALTER TABLE registration_invites
  ADD COLUMN max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 1000);

ALTER TABLE registration_invites
  ADD COLUMN used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0);

-- 旧邀请仍按一次性链接处理，已使用记录回填为 1，避免迁移后重新变为可用。
UPDATE registration_invites
SET used_count = CASE
  WHEN consumed_at IS NOT NULL OR consumed_by_user_id IS NOT NULL THEN 1
  ELSE 0
END;

CREATE TABLE IF NOT EXISTS registration_invite_uses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_id INTEGER NOT NULL,
  user_id INTEGER,
  used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (invite_id, user_id),
  FOREIGN KEY (invite_id) REFERENCES registration_invites(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 校验和计数必须留在数据库事务内，防止并发注册同时消耗最后一次额度。
CREATE TRIGGER IF NOT EXISTS validate_registration_invite_use
BEFORE INSERT ON registration_invite_uses
BEGIN
  SELECT CASE
    WHEN NEW.user_id IS NULL THEN RAISE(ABORT, 'REGISTRATION_INVITE_USER_REQUIRED')
    WHEN NOT EXISTS (
      SELECT 1
      FROM registration_invites
      WHERE id = NEW.invite_id
        AND deleted_at IS NULL
        AND used_count < max_uses
    ) THEN RAISE(ABORT, 'REGISTRATION_INVITE_UNAVAILABLE')
  END;
END;

CREATE TRIGGER IF NOT EXISTS consume_registration_invite_use
AFTER INSERT ON registration_invite_uses
BEGIN
  UPDATE registration_invites
  SET used_count = used_count + 1,
      consumed_by_user_id = NEW.user_id,
      consumed_at = CASE
        WHEN used_count + 1 >= max_uses THEN CURRENT_TIMESTAMP
        ELSE NULL
      END
  WHERE id = NEW.invite_id;
END;

CREATE INDEX IF NOT EXISTS idx_registration_invite_uses_invite
  ON registration_invite_uses(invite_id, used_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_invites_usage
  ON registration_invites(deleted_at, used_count, max_uses, created_at DESC);
