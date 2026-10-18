-- 檔案存储從 R2 遷移至 D1：uploaded_files 新增 data BLOB，owner 放寬為可空（系統檔案）。
-- SQLite 無法原地放寬 NOT NULL，需整表重建；本遷移在部署流水線的單一事務內執行。
CREATE TABLE uploaded_files_d1 (
  object_key TEXT PRIMARY KEY,
  owner_user_id INTEGER,
  filename TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  data BLOB,
  client_upload_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO uploaded_files_d1 (
  object_key, owner_user_id, filename, content_type, size, client_upload_id, created_at
)
SELECT object_key, owner_user_id, filename, content_type, size, client_upload_id, created_at
FROM uploaded_files;

DROP TABLE uploaded_files;

ALTER TABLE uploaded_files_d1 RENAME TO uploaded_files;

CREATE INDEX IF NOT EXISTS idx_uploaded_files_owner
  ON uploaded_files(owner_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_uploaded_files_client_upload
  ON uploaded_files(owner_user_id, client_upload_id)
  WHERE client_upload_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gc_uploaded_created
ON uploaded_files(created_at, object_key);
