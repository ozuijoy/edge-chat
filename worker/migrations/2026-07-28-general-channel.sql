INSERT OR IGNORE INTO channels (name, description, kind, created_by)
VALUES ('general', '', 'public', NULL);

-- 迁移既有账号，避免 general 只是“可见”却没有消息与实时连接权限。
INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, invited_by)
SELECT c.id, u.id, 'member', NULL
FROM channels c
CROSS JOIN users u
WHERE c.name = 'general'
  AND c.kind = 'public'
  AND c.deleted_at IS NULL
  AND u.deleted_at IS NULL;

-- 从数据库入口覆盖所有未来的建号路径，防止新入口忘记同步系统群成员关系。
CREATE TRIGGER IF NOT EXISTS add_new_user_to_general
AFTER INSERT ON users
WHEN NEW.deleted_at IS NULL
BEGIN
  INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, invited_by)
  SELECT id, NEW.id, 'member', NULL
  FROM channels
  WHERE name = 'general'
    AND kind = 'public'
    AND deleted_at IS NULL;
END;

-- general 必须永久保留全部成员，数据库层兜底阻止任何遗漏的删除路径破坏不变量。
CREATE TRIGGER IF NOT EXISTS prevent_general_member_removal
BEFORE DELETE ON channel_members
WHEN EXISTS (
  SELECT 1
  FROM channels
  WHERE id = OLD.channel_id
    AND name = 'general'
)
BEGIN
  SELECT RAISE(ABORT, 'GENERAL_MEMBERSHIP_REQUIRED');
END;

-- 名称、公开属性和存活状态共同标识系统群，禁止绕过 API 改名、转私有或软删除。
CREATE TRIGGER IF NOT EXISTS protect_general_channel
BEFORE UPDATE OF name, kind, deleted_at ON channels
WHEN OLD.name = 'general'
  AND (
    NEW.name != 'general'
    OR NEW.kind != 'public'
    OR NEW.deleted_at IS NOT NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'GENERAL_CHANNEL_REQUIRED');
END;
