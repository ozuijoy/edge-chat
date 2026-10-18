PRAGMA foreign_keys = ON;

ALTER TABLE registration_invites
  ADD COLUMN max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 1000);

ALTER TABLE registration_invites
  ADD COLUMN used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0);

-- 舊邀請仍按一次性鏈接處理，已使用記錄回填為 1，避免遷移後重新變為可用。
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

-- 校驗和計數必須留在數據庫事務內，防止併發註冊同時消耗最後一次額度。
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
