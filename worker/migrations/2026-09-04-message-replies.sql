ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER;
ALTER TABLE messages ADD COLUMN reply_to_sender_id INTEGER;

-- 回覆目標會先經過同房間校驗；額外保存本地原作者 ID，讓原消息過期後“有人@我”仍可按未讀游標準確計算。
CREATE INDEX IF NOT EXISTS idx_messages_reply_attention
ON messages(channel_id, reply_to_sender_id, id)
WHERE reply_to_sender_id IS NOT NULL;
