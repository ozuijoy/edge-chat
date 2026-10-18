-- 保留旧首末快照里实际存在的数据，不虚构未采集过的中间登录或早期浏览器信息。
ALTER TABLE user_login_info RENAME TO user_login_info_legacy;
CREATE TABLE user_login_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT NOT NULL CHECK(length(ip) <= 64),
  login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT NOT NULL CHECK(length(user_agent) <= 1024),
  login_probe_id TEXT NOT NULL DEFAULT '',
  webrtc_ips TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(webrtc_ips) AND json_type(webrtc_ips) = 'array' AND json_array_length(webrtc_ips) <= 4 AND length(webrtc_ips) <= 193),
  webrtc_status TEXT NOT NULL DEFAULT 'not_run',
  webrtc_checked_at TEXT
);
CREATE INDEX idx_user_login_info_recent ON user_login_info(user_id, id DESC);
CREATE TRIGGER limit_user_login_info
AFTER INSERT ON user_login_info
BEGIN
  DELETE FROM user_login_info WHERE user_id = NEW.user_id AND id NOT IN (
    SELECT id FROM user_login_info WHERE user_id = NEW.user_id ORDER BY id DESC LIMIT 3
  );
END;
INSERT INTO user_login_info (user_id, ip, login_at, user_agent)
SELECT user_id, first_ip, first_login_at, '' FROM user_login_info_legacy
WHERE first_ip != last_ip OR first_login_at != last_login_at;
INSERT INTO user_login_info (user_id, ip, login_at, user_agent, login_probe_id, webrtc_ips, webrtc_status, webrtc_checked_at)
SELECT user_id, last_ip, last_login_at, user_agent, login_probe_id, webrtc_ips, webrtc_status, webrtc_checked_at
FROM user_login_info_legacy;
-- 新表已接收可保留的旧数据，移除旧快照，防止首次 IP 成为永不淘汰的第四份记录。
DROP TABLE user_login_info_legacy;
