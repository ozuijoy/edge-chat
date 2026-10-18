-- 首末快照仍為一人一行；一次性 ID 防止遲到的探測覆蓋後續登錄。
ALTER TABLE user_login_info ADD COLUMN login_probe_id TEXT NOT NULL DEFAULT '';
ALTER TABLE user_login_info ADD COLUMN webrtc_ips TEXT NOT NULL DEFAULT '[]';
ALTER TABLE user_login_info ADD COLUMN webrtc_status TEXT NOT NULL DEFAULT 'not_run';
ALTER TABLE user_login_info ADD COLUMN webrtc_checked_at TEXT;
