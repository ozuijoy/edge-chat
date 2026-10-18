ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER;
ALTER TABLE messages ADD COLUMN reply_to_sender_id INTEGER;

-- 回复目标会先经过同房间校验；额外保存本地原作者 ID，让原消息过期后“有人@我”仍可按未读游标准确计算。
CREATE INDEX IF NOT EXISTS idx_messages_reply_attention
ON messages(channel_id, reply_to_sender_id, id)
WHERE reply_to_sender_id IS NOT NULL;
