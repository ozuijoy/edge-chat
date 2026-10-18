package com.aozorae.edgechat.core.database

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(database: SupportSQLiteDatabase) {
        // 提及未讀與普通未讀語義不同，獨立列能讓會話列表穩定恢復多設備同步狀態。
        database.execSQL("ALTER TABLE conversations ADD COLUMN mentionUnreadCount INTEGER NOT NULL DEFAULT 0")
        // 離線消息和待發送隊列都保留提及目標，避免重連或 WorkManager 重試時靜默丟失通知。
        database.execSQL("ALTER TABLE messages ADD COLUMN mentionUserIds TEXT NOT NULL DEFAULT ''")
        database.execSQL("ALTER TABLE outbox ADD COLUMN mentionUserIds TEXT NOT NULL DEFAULT ''")
    }
}

val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(database: SupportSQLiteDatabase) {
        // 語音語義屬於消息本身，持久化後歷史同步、離線隊列和重啟恢復才能共享同一套氣泡體驗。
        database.execSQL("ALTER TABLE messages ADD COLUMN attachmentKind TEXT")
        database.execSQL("ALTER TABLE messages ADD COLUMN attachmentDurationMs INTEGER")
        database.execSQL("ALTER TABLE messages ADD COLUMN attachmentWaveform TEXT NOT NULL DEFAULT ''")
        database.execSQL("ALTER TABLE outbox ADD COLUMN attachmentKind TEXT")
        database.execSQL("ALTER TABLE outbox ADD COLUMN attachmentDurationMs INTEGER")
        database.execSQL("ALTER TABLE outbox ADD COLUMN attachmentWaveform TEXT NOT NULL DEFAULT ''")
    }
}
