package com.aozorae.edgechat.core.repository

import androidx.room.withTransaction
import com.aozorae.edgechat.core.database.EdgeChatDatabase
import com.aozorae.edgechat.core.database.MessageEntity
import com.aozorae.edgechat.core.database.RoomSyncEntity
import com.aozorae.edgechat.core.database.toEntity
import com.aozorae.edgechat.core.network.EdgeChatApi
import com.aozorae.edgechat.core.network.EdgeChatApiException
import com.aozorae.edgechat.core.network.bodyOrThrow
import com.aozorae.edgechat.core.network.dto.CreateGroupRequest
import com.aozorae.edgechat.core.network.dto.InviteMembersRequest
import com.aozorae.edgechat.core.network.dto.OpenDmRequest
import com.aozorae.edgechat.core.network.dto.ReadRequest
import com.aozorae.edgechat.core.network.dto.RealtimeEnvelope
import com.aozorae.edgechat.core.network.dto.UpdateChannelRequest
import javax.inject.Inject
import javax.inject.Singleton
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json

data class RoomIdentity(val kind: String, val id: Long)

@Singleton
class ChatRepository @Inject constructor(
    private val api: EdgeChatApi,
    private val json: Json,
    private val database: EdgeChatDatabase,
    private val attachments: AttachmentRepository,
) {
    private val roomLocks = ConcurrentHashMap<RoomIdentity, Mutex>()
    val conversations = database.conversations().observeAll()
    val users = database.users().observeAll()

    fun messages(room: RoomIdentity): Flow<List<MessageEntity>> =
        database.messages().observeRoom(room.kind, room.id)

    suspend fun bootstrap() {
        val payload = api.bootstrap().bodyOrThrow(json)
        database.withTransaction {
            database.users().clear()
            database.conversations().clear()
            database.users().upsertAll(payload.users.map { it.toEntity() })
            database.conversations().upsertAll(
                payload.channels.map { it.toEntity() } + payload.dms.map { it.toEntity() },
            )
        }
    }

    suspend fun loadLatest(room: RoomIdentity) = withRoomLock(room) {
        loadLatestUnlocked(room, reset = false)
    }

    private suspend fun loadLatestUnlocked(room: RoomIdentity, reset: Boolean) {
        val page = api.messages(room.kind, room.id).bodyOrThrow(json)
        database.withTransaction {
            val existingCursor = database.roomSync().cursor(room.kind, room.id)
            if (reset) database.messages().deleteRoom(room.kind, room.id)
            database.messages().upsertAll(page.messages.map { it.toEntity(room.kind, room.id) })
            if (reset || existingCursor == null) {
                database.roomSync().upsert(RoomSyncEntity(room.kind, room.id, page.syncCursor))
            }
        }
    }

    suspend fun loadOlder(room: RoomIdentity) = withRoomLock(room) {
        val before = database.messages().oldestId(room.kind, room.id)
            ?: return@withRoomLock loadLatestUnlocked(room, reset = false)
        val page = api.messages(room.kind, room.id, before = before).bodyOrThrow(json)
        database.messages().upsertAll(page.messages.map { it.toEntity(room.kind, room.id) })
    }

    suspend fun sync(room: RoomIdentity) = withRoomLock(room) {
        var cursor = database.roomSync().cursor(room.kind, room.id) ?: 0L
        try {
            do {
                val page = api.sync(room.kind, room.id, cursor).bodyOrThrow(json)
                database.withTransaction {
                    page.events.forEach { event ->
                        when (event.type) {
                            "message" -> event.message?.let {
                                database.messages().upsert(it.toEntity(room.kind, room.id))
                                it.clientMessageId?.let { clientMessageId ->
                                    database.outbox().delete(clientMessageId)
                                }
                            }
                            "message_deleted" -> event.messageId?.let { database.messages().delete(it) }
                        }
                    }
                    cursor = page.nextCursor
                    database.roomSync().upsert(RoomSyncEntity(room.kind, room.id, cursor))
                }
            } while (page.hasMore)
        } catch (error: EdgeChatApiException) {
            if (error.code != "sync_cursor_expired") throw error
            loadLatestUnlocked(room, reset = true)
        }
    }

    suspend fun handleRealtime(envelope: RealtimeEnvelope, currentRoom: RoomIdentity?) {
        when (envelope.type) {
            "message" -> {
                val room = envelope.room?.let { RoomIdentity(it.kind, it.id) } ?: currentRoom ?: return
                envelope.message?.let { message ->
                    database.messages().upsert(message.toEntity(room.kind, room.id))
                    message.clientMessageId?.let { clientMessageId ->
                        database.outbox().delete(clientMessageId)
                    }
                }
            }
            "message_deleted" -> envelope.messageId?.let { database.messages().delete(it) }
            "room_message" -> {
                val room = envelope.room?.let { RoomIdentity(it.kind, it.id) } ?: return
                database.conversations().updateActivity(
                    room.kind,
                    room.id,
                    envelope.unreadCount,
                    envelope.mentionUnreadCount,
                    envelope.createdAt,
                )
                sync(room)
            }
        }
    }

    suspend fun markRead(room: RoomIdentity) {
        val latest = database.messages().latestId(room.kind, room.id)
        api.markRead(room.kind, room.id, ReadRequest(latest)).bodyOrThrow(json)
        database.conversations().clearUnread(room.kind, room.id)
    }

    suspend fun deleteMessage(room: RoomIdentity, messageId: Long) {
        api.deleteMessage(room.kind, room.id, messageId).bodyOrThrow(json)
        database.messages().delete(messageId)
    }

    suspend fun join(channelId: Long) {
        api.joinChannel(channelId).bodyOrThrow(json)
        bootstrap()
    }

    suspend fun openDm(userId: Long): RoomIdentity {
        val dm = api.openDm(OpenDmRequest(userId)).bodyOrThrow(json).dm
        bootstrap()
        return RoomIdentity("dm", dm.id)
    }

    suspend fun createGroup(
        name: String,
        description: String,
        kind: String,
        memberIds: List<Long>,
    ): RoomIdentity {
        val channel = api.createGroup(
            CreateGroupRequest(name.trim(), description.trim(), kind, memberIds),
        ).bodyOrThrow(json).channel
        bootstrap()
        return RoomIdentity(channel.kind, channel.id)
    }

    suspend fun members(channelId: Long) = api.members(channelId).bodyOrThrow(json)

    suspend fun invite(channelId: Long, userIds: List<Long>) =
        api.inviteMembers(channelId, InviteMembersRequest(userIds)).bodyOrThrow(json).members

    suspend fun removeMember(channelId: Long, userId: Long) =
        api.removeMember(channelId, userId).bodyOrThrow(json).members

    suspend fun updateGroup(channelId: Long, name: String) {
        api.updateChannel(channelId, UpdateChannelRequest(name = name.trim())).bodyOrThrow(json)
        bootstrap()
    }

    suspend fun deleteGroup(channelId: Long) {
        api.deleteChannel(channelId).bodyOrThrow(json)
        bootstrap()
    }

    suspend fun clearCache() {
        database.clearAllTables()
        attachments.clearPrivateFiles()
        bootstrap()
    }

    private suspend fun <T> withRoomLock(room: RoomIdentity, block: suspend () -> T): T =
        roomLocks.getOrPut(room) { Mutex() }.withLock { block() }
}
