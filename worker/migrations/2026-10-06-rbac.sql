ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_super_admin IN (0, 1));
ALTER TABLE users ADD COLUMN management_protected INTEGER NOT NULL DEFAULT 0 CHECK(management_protected IN (0, 1));
ALTER TABLE users ADD COLUMN authz_version INTEGER NOT NULL DEFAULT 0;
-- 旧 is_admin 只代表历史全权账号；此回填仅由迁移清单执行一次，后续部署不重复授予身份。
UPDATE users SET is_super_admin = is_admin, management_protected = is_admin;

CREATE TABLE rbac_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 500),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO rbac_roles (id, key, name) VALUES (1, 'ordinary', '普通用户');
CREATE TABLE rbac_role_permissions (
  role_id INTEGER NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  PRIMARY KEY(role_id, permission_key)
);
CREATE TABLE rbac_user_roles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL DEFAULT 1 REFERENCES rbac_roles(id) ON DELETE RESTRICT,
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_rbac_members ON rbac_user_roles(role_id, user_id);
INSERT INTO rbac_user_roles (user_id) SELECT id FROM users;
CREATE TABLE admin_write_guard (request_id TEXT PRIMARY KEY, ok INTEGER NOT NULL CHECK(ok = 1));
CREATE TABLE admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  actor_id INTEGER,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '{}',
  result TEXT NOT NULL DEFAULT 'success',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_admin_audit_time ON admin_audit_log(created_at, id);
-- 每次写入最多清理 100 条，避免审计无限增长，也不在后台请求内执行全表清理。
CREATE TRIGGER limit_admin_audit AFTER INSERT ON admin_audit_log BEGIN
  DELETE FROM admin_audit_log WHERE id IN (SELECT id FROM admin_audit_log
    WHERE created_at < datetime('now', '-90 days') OR id <= NEW.id - 10000 ORDER BY id LIMIT 100);
END;
CREATE TRIGGER assign_new_user_rbac AFTER INSERT ON users BEGIN
  INSERT INTO rbac_user_roles (user_id) VALUES (NEW.id);
END;
CREATE TRIGGER protect_default_rbac_update BEFORE UPDATE ON rbac_roles
WHEN OLD.id = 1 BEGIN SELECT RAISE(ABORT, 'rbac_default_protected'); END;
CREATE TRIGGER protect_default_rbac_delete BEFORE DELETE ON rbac_roles
WHEN OLD.id = 1 BEGIN SELECT RAISE(ABORT, 'rbac_default_protected'); END;
CREATE TRIGGER protect_default_rbac_permissions BEFORE INSERT ON rbac_role_permissions
WHEN NEW.role_id = 1 BEGIN SELECT RAISE(ABORT, 'rbac_default_protected'); END;
CREATE TRIGGER protect_super_rbac_assignment BEFORE UPDATE ON rbac_user_roles
WHEN NEW.role_id != 1 AND EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND is_super_admin = 1)
BEGIN SELECT RAISE(ABORT, 'rbac_super_group'); END;
CREATE TRIGGER protect_last_super_update BEFORE UPDATE ON users
WHEN OLD.is_super_admin = 1 AND OLD.deleted_at IS NULL AND OLD.is_disabled = 0
  AND (OLD.disabled_until IS NULL OR OLD.disabled_until <= CURRENT_TIMESTAMP)
  AND (NEW.is_super_admin = 0 OR NEW.deleted_at IS NOT NULL OR NEW.is_disabled = 1 OR NEW.disabled_until > CURRENT_TIMESTAMP)
  AND NOT EXISTS (SELECT 1 FROM users WHERE id != OLD.id AND is_super_admin = 1 AND deleted_at IS NULL
    AND is_disabled = 0 AND (disabled_until IS NULL OR disabled_until <= CURRENT_TIMESTAMP))
BEGIN SELECT RAISE(ABORT, 'rbac_last_super'); END;
CREATE TRIGGER protect_last_super_delete BEFORE DELETE ON users
WHEN OLD.is_super_admin = 1 AND OLD.deleted_at IS NULL AND OLD.is_disabled = 0
  AND (OLD.disabled_until IS NULL OR OLD.disabled_until <= CURRENT_TIMESTAMP)
  AND NOT EXISTS (SELECT 1 FROM users WHERE id != OLD.id AND is_super_admin = 1 AND deleted_at IS NULL
    AND is_disabled = 0 AND (disabled_until IS NULL OR disabled_until <= CURRENT_TIMESTAMP))
BEGIN SELECT RAISE(ABORT, 'rbac_last_super'); END;
