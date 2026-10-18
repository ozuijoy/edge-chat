package com.aozorae.edgechat.core.database

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(database: SupportSQLiteDatabase) {
        // 提及未读与普通未读语义不同，独立列能让会话列表稳定恢复多设备同步状态。
        database.execSQL("ALTER TABLE conversations ADD COLUMN mentionUnreadCount INTEGER NOT NULL DEFAULT 0")
        // 离线消息和待发送队列都保留提及目标，避免重连或 WorkManager 重试时静默丢失通知。
        database.execSQL("ALTER TABLE messages ADD COLUMN mentionUserIds TEXT NOT NULL DEFAULT ''")
        database.execSQL("ALTER TABLE outbox ADD COLUMN mentionUserIds TEXT NOT NULL DEFAULT ''")
    }
}

val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(database: SupportSQLiteDatabase) {
        // 语音语义属于消息本身，持久化后历史同步、离线队列和重启恢复才能共享同一套气泡体验。
        database.execSQL("ALTER TABLE messages ADD COLUMN attachmentKind TEXT")
        database.execSQL("ALTER TABLE messages ADD COLUMN attachmentDurationMs INTEGER")
        database.execSQL("ALTER TABLE messages ADD COLUMN attachmentWaveform TEXT NOT NULL DEFAULT ''")
        database.execSQL("ALTER TABLE outbox ADD COLUMN attachmentKind TEXT")
        database.execSQL("ALTER TABLE outbox ADD COLUMN attachmentDurationMs INTEGER")
        database.execSQL("ALTER TABLE outbox ADD COLUMN attachmentWaveform TEXT NOT NULL DEFAULT ''")
    }
}
