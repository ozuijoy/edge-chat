ALTER TABLE users ADD COLUMN registration_invite_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_registration_invite
  ON users(registration_invite_id)
  WHERE registration_invite_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS registration_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  consumed_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (consumed_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_registration_invites_active
  ON registration_invites(created_at DESC, deleted_at, consumed_at);
