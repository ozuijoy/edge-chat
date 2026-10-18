package com.aozorae.edgechat.core.database

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        UserEntity::class,
        ConversationEntity::class,
        MessageEntity::class,
        RoomSyncEntity::class,
        OutboxEntity::class,
    ],
	version = 3,
    exportSchema = true,
)
abstract class EdgeChatDatabase : RoomDatabase() {
    abstract fun users(): UserDao
    abstract fun conversations(): ConversationDao
    abstract fun messages(): MessageDao
    abstract fun roomSync(): RoomSyncDao
    abstract fun outbox(): OutboxDao
}
