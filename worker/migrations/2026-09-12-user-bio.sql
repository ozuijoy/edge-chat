-- 簡介直接歸屬用戶；舊賬號默認空文本，遷移清單按列存在性避免重複添加。
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
