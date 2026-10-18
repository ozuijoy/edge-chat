package com.aozorae.edgechat.core.repository

import com.aozorae.edgechat.BuildConfig
import com.aozorae.edgechat.core.database.EdgeChatDatabase
import com.aozorae.edgechat.core.network.EdgeChatApi
import com.aozorae.edgechat.core.network.bodyOrThrow
import com.aozorae.edgechat.core.network.dto.ChangePasswordRequest
import com.aozorae.edgechat.core.network.dto.DeviceDto
import com.aozorae.edgechat.core.network.dto.LoginRequest
import com.aozorae.edgechat.core.network.dto.SessionDto
import com.aozorae.edgechat.core.network.dto.UpdateProfileRequest
import com.aozorae.edgechat.core.session.ServerStore
import com.aozorae.edgechat.core.session.StoredTokens
import com.aozorae.edgechat.core.session.TokenVault
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody

@Singleton
class SessionRepository @Inject constructor(
    private val api: EdgeChatApi,
    private val json: Json,
    private val serverStore: ServerStore,
    private val tokenVault: TokenVault,
    private val database: EdgeChatDatabase,
    private val attachments: AttachmentRepository,
) {
    private val mutableSession = MutableStateFlow<SessionDto?>(null)
    val session: StateFlow<SessionDto?> = mutableSession.asStateFlow()
    val hasStoredSession = tokenVault.hasSession

    suspend fun login(username: String, password: String): SessionDto {
        val response = api.login(
            LoginRequest(
                username.trim(),
                password,
                DeviceDto(
                    installationId = serverStore.installationId(),
                    name = serverStore.deviceName(),
                    appVersion = BuildConfig.VERSION_NAME,
                ),
            ),
        ).bodyOrThrow(json)
        tokenVault.save(
            StoredTokens(
                response.accessToken,
                response.refreshToken,
                response.accessTokenExpiresAt,
                response.refreshTokenExpiresAt,
            ),
        )
        mutableSession.value = response.session
        return response.session
    }

    suspend fun restore(): SessionDto? {
        if (tokenVault.read() == null) return null
        return runCatching { api.session().bodyOrThrow(json).session }
            .onSuccess { mutableSession.value = it }
            .onFailure { invalidateLocalSession() }
            .getOrNull()
    }

    suspend fun updateProfile(displayName: String, avatarKey: String? = null, clearAvatar: Boolean = false) {
        mutableSession.value = api.updateProfile(
            UpdateProfileRequest(displayName.trim(), avatarKey, clearAvatar),
        ).bodyOrThrow(json).session
    }

    suspend fun updateAvatar(displayName: String, attachment: PendingAttachment) {
        val file = File(attachment.path)
        val part = MultipartBody.Part.createFormData(
            "file",
            attachment.name,
            file.asRequestBody(attachment.type.toMediaTypeOrNull()),
        )
        val uploaded = api.upload(
            part,
            UUID.randomUUID().toString().toRequestBody("text/plain".toMediaTypeOrNull()),
        ).bodyOrThrow(json).file
        updateProfile(displayName, avatarKey = uploaded.key)
        file.delete()
    }

    suspend fun changePassword(current: String, next: String) {
        api.changePassword(ChangePasswordRequest(current, next)).bodyOrThrow(json)
    }

    suspend fun logout() {
        runCatching { api.logout().bodyOrThrow(json) }
        invalidateLocalSession()
    }

    suspend fun invalidateLocalSession() {
        tokenVault.clear()
        clearSessionState()
        database.clearAllTables()
        attachments.clearPrivateFiles()
    }

    fun clearSessionState() {
        mutableSession.value = null
    }
}
