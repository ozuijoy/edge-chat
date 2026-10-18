CREATE TABLE IF NOT EXISTS uploaded_files (
  object_key TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL,
  filename TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_owner
  ON uploaded_files(owner_user_id, created_at DESC);
