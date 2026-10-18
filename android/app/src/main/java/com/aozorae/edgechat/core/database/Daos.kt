package com.aozorae.edgechat.core.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface UserDao {
    @Query("SELECT * FROM users ORDER BY displayName COLLATE NOCASE")
    fun observeAll(): Flow<List<UserEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(users: List<UserEntity>)

    @Query("DELETE FROM users")
    suspend fun clear()
}

@Dao
interface ConversationDao {
    @Query(
        """SELECT * FROM conversations
           ORDER BY isGeneral DESC, mentionUnreadCount DESC, unreadCount DESC,
                    CASE WHEN lastMessageAt IS NULL THEN 1 ELSE 0 END,
                    lastMessageAt DESC, title COLLATE NOCASE"""
    )
    fun observeAll(): Flow<List<ConversationEntity>>

    @Query("SELECT * FROM conversations WHERE kind = :kind AND id = :roomId LIMIT 1")
    suspend fun get(kind: String, roomId: Long): ConversationEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(conversations: List<ConversationEntity>)

    @Query(
        "UPDATE conversations SET unreadCount = COALESCE(:count, unreadCount), " +
            "mentionUnreadCount = COALESCE(:mentionCount, mentionUnreadCount), " +
            "lastMessageAt = :createdAt WHERE kind = :kind AND id = :roomId"
    )
    suspend fun updateActivity(kind: String, roomId: Long, count: Int?, mentionCount: Int?, createdAt: String?)

    @Query("UPDATE conversations SET unreadCount = 0, mentionUnreadCount = 0 WHERE kind = :kind AND id = :roomId")
    suspend fun clearUnread(kind: String, roomId: Long)

    @Query("DELETE FROM conversations")
    suspend fun clear()
}

@Dao
interface MessageDao {
    @Query("SELECT * FROM messages WHERE roomKind = :kind AND roomId = :roomId ORDER BY id ASC")
    fun observeRoom(kind: String, roomId: Long): Flow<List<MessageEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(messages: List<MessageEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(message: MessageEntity)

    @Query("DELETE FROM messages WHERE id = :messageId")
    suspend fun delete(messageId: Long)

    @Query("DELETE FROM messages WHERE roomKind = :kind AND roomId = :roomId")
    suspend fun deleteRoom(kind: String, roomId: Long)

    @Query("SELECT MIN(id) FROM messages WHERE roomKind = :kind AND roomId = :roomId")
    suspend fun oldestId(kind: String, roomId: Long): Long?

    @Query("SELECT MAX(id) FROM messages WHERE roomKind = :kind AND roomId = :roomId")
    suspend fun latestId(kind: String, roomId: Long): Long?

    @Query("DELETE FROM messages")
    suspend fun clear()
}

@Dao
interface RoomSyncDao {
    @Query("SELECT cursor FROM room_sync WHERE kind = :kind AND roomId = :roomId")
    suspend fun cursor(kind: String, roomId: Long): Long?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(sync: RoomSyncEntity)

    @Query("DELETE FROM room_sync")
    suspend fun clear()
}

@Dao
interface OutboxDao {
    @Query("SELECT * FROM outbox WHERE roomKind = :kind AND roomId = :roomId ORDER BY createdAt ASC")
    fun observeRoom(kind: String, roomId: Long): Flow<List<OutboxEntity>>

    @Query("SELECT * FROM outbox WHERE state IN ('PENDING', 'RETRY') ORDER BY createdAt ASC LIMIT 1")
    suspend fun next(): OutboxEntity?

    @Query("SELECT COUNT(*) FROM outbox WHERE state IN ('PENDING', 'RETRY')")
    suspend fun pendingCount(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: OutboxEntity)

    @Query("UPDATE outbox SET state = :state, failure = :failure WHERE clientMessageId = :id")
    suspend fun updateState(id: String, state: String, failure: String? = null)

    @Query("UPDATE outbox SET state = 'RETRY', failure = :failure, attempts = attempts + 1 WHERE clientMessageId = :id")
    suspend fun markFailed(id: String, failure: String)

    @Query("UPDATE outbox SET state = 'RETRY', failure = NULL WHERE state IN ('UPLOADING', 'SENDING')")
    suspend fun recoverInFlight()

    @Query("UPDATE outbox SET uploadedKey = :key, uploadedUrl = :url, state = 'PENDING', failure = NULL WHERE clientMessageId = :id")
    suspend fun setUploaded(id: String, key: String, url: String)

    @Query("SELECT * FROM outbox WHERE clientMessageId = :id LIMIT 1")
    suspend fun get(id: String): OutboxEntity?

    @Query("DELETE FROM outbox WHERE clientMessageId = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM outbox")
    suspend fun clear()
}
