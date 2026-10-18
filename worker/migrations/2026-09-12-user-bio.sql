-- 简介直接归属用户；旧账号默认空文本，迁移清单按列存在性避免重复添加。
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
