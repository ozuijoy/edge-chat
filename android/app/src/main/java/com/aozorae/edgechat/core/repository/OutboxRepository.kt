package com.aozorae.edgechat.core.repository

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.aozorae.edgechat.core.database.EdgeChatDatabase
import com.aozorae.edgechat.core.database.OutboxEntity
import com.aozorae.edgechat.core.database.decodeMentionUserIds
import com.aozorae.edgechat.core.database.decodeVoiceWaveform
import com.aozorae.edgechat.core.database.encodeMentionUserIds
import com.aozorae.edgechat.core.database.encodeVoiceWaveform
import com.aozorae.edgechat.core.database.toEntity
import com.aozorae.edgechat.core.network.EdgeChatApi
import com.aozorae.edgechat.core.network.bodyOrThrow
import com.aozorae.edgechat.core.network.dto.AttachmentDto
import com.aozorae.edgechat.core.network.dto.SendMessageRequest
import com.aozorae.edgechat.core.session.TokenVault
import com.aozorae.edgechat.worker.OutboxWorker
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody

@Singleton
class OutboxRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: EdgeChatApi,
    private val json: Json,
    private val database: EdgeChatDatabase,
    private val tokenVault: TokenVault,
) {
    private val processingLock = Mutex()
    private val workManager = WorkManager.getInstance(context)

    fun observe(room: RoomIdentity): Flow<List<OutboxEntity>> =
        database.outbox().observeRoom(room.kind, room.id)

    suspend fun enqueue(
        room: RoomIdentity,
        content: String,
        attachment: PendingAttachment? = null,
        mentionUserIds: List<Long> = emptyList(),
    ) {
        val messageId = UUID.randomUUID().toString()
        database.outbox().upsert(
            OutboxEntity(
                clientMessageId = messageId,
                roomKind = room.kind,
                roomId = room.id,
                content = content.trim(),
                localAttachmentPath = attachment?.path,
                attachmentName = attachment?.name,
				attachmentType = attachment?.type,
				attachmentSize = attachment?.size,
				attachmentKind = attachment?.kind,
				attachmentDurationMs = attachment?.durationMs,
				attachmentWaveform = encodeVoiceWaveform(attachment?.waveform.orEmpty()),
                clientUploadId = attachment?.let { UUID.randomUUID().toString() },
                uploadedKey = null,
                uploadedUrl = null,
                mentionUserIds = encodeMentionUserIds(mentionUserIds),
                state = "PENDING",
                failure = null,
                attempts = 0,
                createdAt = System.currentTimeMillis(),
            ),
        )
        schedule()
    }

    suspend fun retry(clientMessageId: String) {
        database.outbox().updateState(clientMessageId, "RETRY")
        schedule()
    }

    suspend fun cancel(clientMessageId: String) {
        database.outbox().get(clientMessageId)?.localAttachmentPath?.let { File(it).delete() }
        database.outbox().delete(clientMessageId)
    }

    suspend fun processNext(): Boolean = processingLock.withLock {
        if (tokenVault.read() == null) return false
        val item = database.outbox().next() ?: return false
        try {
            val attachment = uploadIfNeeded(item)
            database.outbox().updateState(item.clientMessageId, "SENDING")
            val sent = api.sendMessage(
                item.roomKind,
                item.roomId,
                SendMessageRequest(
                    item.clientMessageId,
                    item.content,
                    attachment,
                    decodeMentionUserIds(item.mentionUserIds),
                ),
            ).bodyOrThrow(json)
            database.messages().upsert(sent.message.toEntity(item.roomKind, item.roomId))
            database.outbox().delete(item.clientMessageId)
            item.localAttachmentPath?.let { File(it).delete() }
            true
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            database.outbox().markFailed(item.clientMessageId, error.message ?: "发送失败")
            false
        }
    }

    suspend fun hasPending(): Boolean = database.outbox().pendingCount() > 0

    suspend fun recoverInterrupted() = processingLock.withLock {
        database.outbox().recoverInFlight()
    }

    suspend fun pauseForServerChange() {
        withContext(Dispatchers.IO) {
            workManager.cancelUniqueWork(WORK_NAME).result.get()
        }
        processingLock.withLock {
            database.outbox().recoverInFlight()
        }
    }

    suspend fun resume() {
        recoverInterrupted()
        if (hasPending()) schedule()
    }

    private suspend fun uploadIfNeeded(item: OutboxEntity): AttachmentDto? {
        val path = item.localAttachmentPath ?: return null
		if (item.uploadedKey != null && item.uploadedUrl != null) {
			return AttachmentDto(
				key = item.uploadedKey,
				name = item.attachmentName.orEmpty(),
				type = item.attachmentType.orEmpty(),
				size = item.attachmentSize ?: 0,
				url = item.uploadedUrl,
				kind = item.attachmentKind,
				durationMs = item.attachmentDurationMs,
				waveform = decodeVoiceWaveform(item.attachmentWaveform),
			)
        }
        database.outbox().updateState(item.clientMessageId, "UPLOADING")
        val file = File(path)
        val type = item.attachmentType ?: "application/octet-stream"
        val part = MultipartBody.Part.createFormData(
            "file",
            item.attachmentName ?: "attachment",
            file.asRequestBody(type.toMediaTypeOrNull()),
        )
        val uploadId = requireNotNull(item.clientUploadId)
        val uploaded = api.upload(part, uploadId.toRequestBody("text/plain".toMediaTypeOrNull()))
            .bodyOrThrow(json)
            .file
        database.outbox().setUploaded(item.clientMessageId, uploaded.key, uploaded.url)
		return uploaded.copy(
			kind = item.attachmentKind,
			durationMs = item.attachmentDurationMs,
			waveform = decodeVoiceWaveform(item.attachmentWaveform),
		)
	}

    private fun schedule() {
        val request = OneTimeWorkRequestBuilder<OutboxWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .build()
        workManager.enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
    }

    companion object {
        const val WORK_NAME = "edgechat-outbox"
    }
}
