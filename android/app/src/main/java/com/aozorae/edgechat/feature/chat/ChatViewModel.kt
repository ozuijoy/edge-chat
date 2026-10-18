package com.aozorae.edgechat.feature.chat

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aozorae.edgechat.core.database.ConversationEntity
import com.aozorae.edgechat.core.database.MessageEntity
import com.aozorae.edgechat.core.database.OutboxEntity
import com.aozorae.edgechat.core.database.UserEntity
import com.aozorae.edgechat.core.network.dto.MemberDto
import com.aozorae.edgechat.core.media.VoicePlaybackController
import com.aozorae.edgechat.core.media.VoicePlaybackState
import com.aozorae.edgechat.core.media.VoiceRecorder
import com.aozorae.edgechat.core.media.VoiceRecordingState
import com.aozorae.edgechat.core.realtime.RealtimeCoordinator
import com.aozorae.edgechat.core.repository.AttachmentRepository
import com.aozorae.edgechat.core.repository.ChatRepository
import com.aozorae.edgechat.core.repository.OutboxRepository
import com.aozorae.edgechat.core.repository.PendingAttachment
import com.aozorae.edgechat.core.repository.RoomIdentity
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.ExperimentalCoroutinesApi

data class ChatUiState(
    val conversations: List<ConversationEntity> = emptyList(),
    val users: List<UserEntity> = emptyList(),
    val selectedRoom: RoomIdentity? = null,
    val messages: List<MessageEntity> = emptyList(),
    val outbox: List<OutboxEntity> = emptyList(),
    val attachment: PendingAttachment? = null,
	val members: List<MemberDto> = emptyList(),
	val voiceRecording: VoiceRecordingState = VoiceRecordingState(),
	val voicePlayback: VoicePlaybackState = VoicePlaybackState(),
    val busy: Boolean = false,
    val error: String? = null,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class ChatViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
    private val outboxRepository: OutboxRepository,
	private val attachmentRepository: AttachmentRepository,
	private val realtime: RealtimeCoordinator,
	private val voiceRecorder: VoiceRecorder,
	private val voicePlayback: VoicePlaybackController,
) : ViewModel() {
    private val mutableOpenAttachment = MutableSharedFlow<Pair<Uri, String>>(extraBufferCapacity = 1)
    val openAttachment: SharedFlow<Pair<Uri, String>> = mutableOpenAttachment
    private val selectedRoom = MutableStateFlow<RoomIdentity?>(null)
    private val attachment = MutableStateFlow<PendingAttachment?>(null)
    private val members = MutableStateFlow<List<MemberDto>>(emptyList())
    private val busy = MutableStateFlow(false)
    private val error = MutableStateFlow<String?>(null)
    private var memberLoadGeneration = 0
    private val roomMessages = selectedRoom.flatMapLatest { room ->
        room?.let(chatRepository::messages) ?: flowOf(emptyList())
    }
    private val roomOutbox = selectedRoom.flatMapLatest { room ->
        room?.let(outboxRepository::observe) ?: flowOf(emptyList())
    }

    val state: StateFlow<ChatUiState> = combine(
        chatRepository.conversations,
        chatRepository.users,
        selectedRoom,
        roomMessages,
        roomOutbox,
        attachment,
		members,
		voiceRecorder.state,
		voicePlayback.state,
		busy,
        error,
    ) { values ->
        @Suppress("UNCHECKED_CAST")
        ChatUiState(
            conversations = values[0] as List<ConversationEntity>,
            users = values[1] as List<UserEntity>,
            selectedRoom = values[2] as RoomIdentity?,
            messages = values[3] as List<MessageEntity>,
            outbox = values[4] as List<OutboxEntity>,
            attachment = values[5] as PendingAttachment?,
            members = values[6] as List<MemberDto>,
			voiceRecording = values[7] as VoiceRecordingState,
			voicePlayback = values[8] as VoicePlaybackState,
			busy = values[9] as Boolean,
			error = values[10] as String?,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ChatUiState())

    fun refresh() = action { chatRepository.bootstrap() }

	fun select(room: RoomIdentity?) {
		if (voiceRecorder.state.value.active) {
			voiceRecorder.cancel()
		}
        val generation = ++memberLoadGeneration
        selectedRoom.value = room
        members.value = emptyList()
        realtime.setRoom(room)
        if (room != null) {
            if (room.kind != "dm") {
                viewModelScope.launch {
                    runCatching { chatRepository.members(room.id).members }
                        .onSuccess { loadedMembers ->
                            if (generation == memberLoadGeneration && selectedRoom.value == room) {
                                members.value = loadedMembers
                            }
                        }
                }
            }
            action {
            chatRepository.loadLatest(room)
            chatRepository.sync(room)
            chatRepository.markRead(room)
			}
        }
    }

    fun loadOlder() {
        selectedRoom.value?.let { room -> action { chatRepository.loadOlder(room) } }
    }

    fun send(content: String, mentionUserIds: List<Long>) {
        val room = selectedRoom.value ?: return
        val pending = attachment.value
        if (content.isBlank() && pending == null) return
        action {
            outboxRepository.enqueue(room, content, pending, mentionUserIds)
            attachment.value = null
        }
    }

    fun chooseAttachment(uri: Uri) = action {
        attachment.value = attachmentRepository.import(uri)
    }

	fun clearAttachment() {
        attachment.value?.path?.let { java.io.File(it).delete() }
        attachment.value = null
	}

	fun startVoiceRecording() {
		error.value = null
		runCatching(voiceRecorder::start)
			.onFailure { error.value = it.message ?: "无法开始录音" }
	}

	fun cancelVoiceRecording() {
		voiceRecorder.cancel()
	}

	fun sendVoiceRecording() {
		val room = selectedRoom.value ?: return
		val pending = voiceRecorder.finish()
		if (pending == null) {
			error.value = "录音时间太短，请重新录制"
			return
		}
		action { outboxRepository.enqueue(room, "", pending) }
	}

	fun toggleVoicePlayback(playbackId: String, url: String, durationMs: Long) {
		voicePlayback.toggle(playbackId, url, durationMs)
	}

	fun seekVoicePlayback(playbackId: String, fraction: Float) {
		voicePlayback.seek(playbackId, fraction)
	}

	fun cycleVoicePlaybackSpeed(playbackId: String) {
		voicePlayback.cycleSpeed(playbackId)
	}

    fun retry(clientMessageId: String) = action { outboxRepository.retry(clientMessageId) }

    fun cancel(clientMessageId: String) = action { outboxRepository.cancel(clientMessageId) }

    fun deleteMessage(messageId: Long) {
        selectedRoom.value?.let { room -> action { chatRepository.deleteMessage(room, messageId) } }
    }

    fun openAttachment(url: String, name: String, type: String) = action {
        mutableOpenAttachment.emit(attachmentRepository.download(url, name) to type)
    }

    fun join(channelId: Long) = action { chatRepository.join(channelId) }

    fun openDm(userId: Long) = action { select(chatRepository.openDm(userId)) }

    fun createGroup(name: String, description: String, kind: String, memberIds: List<Long>) = action {
        select(chatRepository.createGroup(name, description, kind, memberIds))
    }

    fun loadMembers(channelId: Long) = updateMembers(channelId) {
        chatRepository.members(channelId).members
    }

    fun invite(channelId: Long, userIds: List<Long>) = updateMembers(channelId) {
        chatRepository.invite(channelId, userIds)
    }

    fun removeMember(channelId: Long, userId: Long) = updateMembers(channelId) {
        chatRepository.removeMember(channelId, userId)
    }

    fun renameGroup(channelId: Long, name: String) = action {
        chatRepository.updateGroup(channelId, name)
    }

    fun deleteGroup(channelId: Long) = action {
        chatRepository.deleteGroup(channelId)
        select(null)
    }

    fun clearError() {
        error.value = null
    }

    override fun onCleared() {
        voiceRecorder.close()
        voicePlayback.close()
        super.onCleared()
    }

    private fun updateMembers(channelId: Long, request: suspend () -> List<MemberDto>) {
        val generation = memberLoadGeneration
        action {
            val loadedMembers = request()
            val room = selectedRoom.value
            if (generation == memberLoadGeneration && room?.kind != "dm" && room?.id == channelId) {
                members.value = loadedMembers
            }
        }
    }

    private fun action(block: suspend () -> Unit) {
        viewModelScope.launch {
            busy.value = true
            error.value = null
            runCatching { block() }.onFailure { error.value = it.message ?: "操作失败" }
            busy.value = false
        }
    }
}
