DROP TRIGGER IF EXISTS prevent_pending_message_attachment_insert;
DROP TRIGGER IF EXISTS prevent_pending_message_attachment_update;
DROP TRIGGER IF EXISTS prevent_pending_user_avatar_insert;
DROP TRIGGER IF EXISTS prevent_pending_user_avatar_update;
DROP TRIGGER IF EXISTS prevent_pending_channel_avatar_insert;
DROP TRIGGER IF EXISTS prevent_pending_channel_avatar_update;
DROP TRIGGER IF EXISTS prevent_pending_site_icon_insert;
DROP TRIGGER IF EXISTS prevent_pending_site_icon_update;
DROP TRIGGER IF EXISTS prevent_general_member_removal;

-- general 继续保护活跃成员；已软删用户必须允许由 GC 清掉成员关系和最终账号记录。
CREATE TRIGGER prevent_general_member_removal
BEFORE DELETE ON channel_members
WHEN EXISTS (
  SELECT 1
  FROM channels
  WHERE id = OLD.channel_id
    AND name = 'general'
)
  AND EXISTS (
    SELECT 1
    FROM users
    WHERE id = OLD.user_id
      AND deleted_at IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'GENERAL_MEMBERSHIP_REQUIRED');
END;

-- 本地消息在同一条 INSERT/UPDATE 中确认上传登记、归属和清理状态，删除完成后也不会重新接受旧 key。
CREATE TRIGGER prevent_pending_message_attachment_insert
BEFORE INSERT ON messages
WHEN NEW.attachment_key IS NOT NULL
  AND (
    (
      NEW.sender_kind = 'local'
      AND NOT EXISTS (
        SELECT 1
        FROM uploaded_files
        WHERE object_key = NEW.attachment_key
          AND owner_user_id = NEW.sender_id
          AND NOT EXISTS (
            SELECT 1 FROM pending_r2_delete
            WHERE pending_r2_delete.object_key = uploaded_files.object_key
          )
      )
    )
    OR (
      NEW.sender_kind = 'external'
      AND EXISTS (
        SELECT 1 FROM pending_r2_delete
        WHERE object_key = NEW.attachment_key
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_local_object_unavailable');
END;

CREATE TRIGGER prevent_pending_message_attachment_update
BEFORE UPDATE OF attachment_key ON messages
WHEN NEW.attachment_key IS NOT NULL
  AND (
    (
      NEW.sender_kind = 'local'
      AND NOT EXISTS (
        SELECT 1
        FROM uploaded_files
        WHERE object_key = NEW.attachment_key
          AND owner_user_id = NEW.sender_id
          AND NOT EXISTS (
            SELECT 1 FROM pending_r2_delete
            WHERE pending_r2_delete.object_key = uploaded_files.object_key
          )
      )
    )
    OR (
      NEW.sender_kind = 'external'
      AND EXISTS (
        SELECT 1 FROM pending_r2_delete
        WHERE object_key = NEW.attachment_key
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_local_object_unavailable');
END;

-- 用户头像继续要求本人上传；群头像的管理权限仍由 API 决定，数据库只仲裁文件生命周期。
CREATE TRIGGER prevent_pending_user_avatar_insert
BEFORE INSERT ON users
WHEN NEW.avatar_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM uploaded_files
    WHERE object_key = NEW.avatar_key
      AND owner_user_id = NEW.id
      AND NOT EXISTS (
        SELECT 1 FROM pending_r2_delete
        WHERE pending_r2_delete.object_key = uploaded_files.object_key
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_local_object_unavailable');
END;

CREATE TRIGGER prevent_pending_user_avatar_update
BEFORE UPDATE OF avatar_key ON users
WHEN NEW.avatar_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM uploaded_files
    WHERE object_key = NEW.avatar_key
      AND owner_user_id = NEW.id
      AND NOT EXISTS (
        SELECT 1 FROM pending_r2_delete
        WHERE pending_r2_delete.object_key = uploaded_files.object_key
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_local_object_unavailable');
END;

CREATE TRIGGER prevent_pending_channel_avatar_insert
BEFORE INSERT ON channels
WHEN NEW.avatar_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM uploaded_files
    WHERE object_key = NEW.avatar_key
      AND NOT EXISTS (
        SELECT 1 FROM pending_r2_delete
        WHERE pending_r2_delete.object_key = uploaded_files.object_key
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_local_object_unavailable');
END;

CREATE TRIGGER prevent_pending_channel_avatar_update
BEFORE UPDATE OF avatar_key ON channels
WHEN NEW.avatar_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM uploaded_files
    WHERE object_key = NEW.avatar_key
      AND NOT EXISTS (
        SELECT 1 FROM pending_r2_delete
        WHERE pending_r2_delete.object_key = uploaded_files.object_key
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_local_object_unavailable');
END;

-- r2: 前缀是站点图标在 D1 中的明确本地 key 语义；外部 URL 不经过本地文件约束。
CREATE TRIGGER prevent_pending_site_icon_insert
BEFORE INSERT ON site_settings
WHEN NEW.setting_key = 'site_icon_url'
  AND NEW.setting_value GLOB 'r2:*'
  AND NOT EXISTS (
    SELECT 1
    FROM uploaded_files
    WHERE object_key = substr(NEW.setting_value, 4)
      AND NOT EXISTS (
        SELECT 1 FROM pending_r2_delete
        WHERE pending_r2_delete.object_key = uploaded_files.object_key
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_local_object_unavailable');
END;

CREATE TRIGGER prevent_pending_site_icon_update
BEFORE UPDATE OF setting_value ON site_settings
WHEN NEW.setting_key = 'site_icon_url'
  AND NEW.setting_value GLOB 'r2:*'
  AND NOT EXISTS (
    SELECT 1
    FROM uploaded_files
    WHERE object_key = substr(NEW.setting_value, 4)
      AND NOT EXISTS (
        SELECT 1 FROM pending_r2_delete
        WHERE pending_r2_delete.object_key = uploaded_files.object_key
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'r2_local_object_unavailable');
END;
