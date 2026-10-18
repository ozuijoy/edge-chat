ALTER TABLE messages ADD COLUMN attachment_kind TEXT CHECK (
  attachment_kind IS NULL OR attachment_kind IN ('voice', 'audio')
);
ALTER TABLE messages ADD COLUMN attachment_duration_ms INTEGER;
ALTER TABLE messages ADD COLUMN attachment_waveform TEXT;
