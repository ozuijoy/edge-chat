package com.aozorae.edgechat.core.database

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey val id: Long,
    val username: String,
    val displayName: String,
    val avatarUrl: String,
)

@Entity(tableName = "conversations", primaryKeys = ["kind", "id"])
data class ConversationEntity(
    val kind: String,
    val id: Long,
    val title: String,
    val subtitle: String,
    val avatarUrl: String,
    val isGeneral: Boolean,
    val isMember: Boolean,
    val canManage: Boolean,
    val myRole: String,
    val memberCount: Int,
    val otherUserId: Long?,
    val lastMessageAt: String?,
    val unreadCount: Int,
    val mentionUnreadCount: Int = 0,
)

@Entity(
    tableName = "messages",
    indices = [Index(value = ["roomKind", "roomId", "id"])],
)
data class MessageEntity(
    @PrimaryKey val id: Long,
    val roomKind: String,
    val roomId: Long,
    val clientMessageId: String?,
    val content: String,
    val createdAt: String,
    val source: String,
    val senderKind: String,
    val senderId: String,
    val senderUsername: String,
    val senderDisplayName: String,
    val senderAvatarUrl: String,
    val attachmentKey: String?,
    val attachmentName: String?,
    val attachmentType: String?,
	val attachmentSize: Long?,
	val attachmentUrl: String?,
	val attachmentKind: String? = null,
	val attachmentDurationMs: Long? = null,
	val attachmentWaveform: String = "",
	val mentionUserIds: String = "",
)

@Entity(tableName = "room_sync", primaryKeys = ["kind", "roomId"])
data class RoomSyncEntity(val kind: String, val roomId: Long, val cursor: Long)

@Entity(tableName = "outbox", indices = [Index(value = ["createdAt"])])
data class OutboxEntity(
    @PrimaryKey val clientMessageId: String,
    val roomKind: String,
    val roomId: Long,
    val content: String,
    val localAttachmentPath: String?,
    val attachmentName: String?,
    val attachmentType: String?,
	val attachmentSize: Long?,
	val attachmentKind: String? = null,
	val attachmentDurationMs: Long? = null,
	val attachmentWaveform: String = "",
	val clientUploadId: String?,
    val uploadedKey: String?,
    val uploadedUrl: String?,
    val mentionUserIds: String = "",
    val state: String,
    val failure: String?,
    val attempts: Int,
    val createdAt: Long,
)
