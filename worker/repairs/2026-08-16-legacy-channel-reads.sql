-- 旧版 channel_reads 直接外键引用 messages，会阻止 Telegram 迁移重建消息表。
-- 先把仍有价值的已读游标合并到现行表，再移除已经停用的旧表及其外键。
CREATE TABLE IF NOT EXISTS message_reads (
  channel_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  last_read_message_id INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (channel_id, user_id),
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_message_reads_user
  ON message_reads(user_id, updated_at DESC);

INSERT INTO message_reads (channel_id, user_id, last_read_message_id, updated_at)
SELECT channel_id, user_id, last_read_message_id, last_read_at
FROM channel_reads
WHERE 1
ON CONFLICT(channel_id, user_id) DO UPDATE SET
  last_read_message_id = MAX(message_reads.last_read_message_id, excluded.last_read_message_id),
  updated_at = CASE
    WHEN excluded.last_read_message_id > message_reads.last_read_message_id
      THEN excluded.updated_at
    ELSE message_reads.updated_at
  END;

DROP TABLE channel_reads;
