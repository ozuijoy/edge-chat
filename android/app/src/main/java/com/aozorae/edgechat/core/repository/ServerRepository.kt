package com.aozorae.edgechat.core.repository

import com.aozorae.edgechat.core.database.EdgeChatDatabase
import com.aozorae.edgechat.core.network.EdgeChatApiException
import com.aozorae.edgechat.core.network.dto.ApiErrorEnvelope
import com.aozorae.edgechat.core.network.dto.CapabilitiesResponse
import com.aozorae.edgechat.core.session.ServerProfile
import com.aozorae.edgechat.core.session.ServerStore
import com.aozorae.edgechat.core.session.TokenVault
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request

data class ServerConnection(
    val capabilities: CapabilitiesResponse,
    val serverChanged: Boolean,
)

@Singleton
class ServerRepository @Inject constructor(
    private val serverStore: ServerStore,
    private val tokenVault: TokenVault,
    private val database: EdgeChatDatabase,
    private val json: Json,
    private val attachments: AttachmentRepository,
) {
    private val publicClient = OkHttpClient.Builder().build()

    suspend fun connect(rawUrl: String): ServerConnection = withContext(Dispatchers.IO) {
        val baseUrl = ServerStore.normalize(rawUrl)
        val request = Request.Builder().url("${baseUrl}api/v1/capabilities").build()
        val capabilities = publicClient.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val error = runCatching { json.decodeFromString<ApiErrorEnvelope>(body).error }.getOrNull()
                throw EdgeChatApiException(
                    error?.code ?: "server_unavailable",
                    error?.message ?: "无法连接该 EdgeChat 服务器",
                    response.code,
                )
            }
            json.decodeFromString<CapabilitiesResponse>(body)
        }
        if (capabilities.apiVersion != 1) {
            throw EdgeChatApiException("api_version_unsupported", "服务器尚未支持 EdgeChat API v1", 400)
        }
        val previous = serverStore.baseUrl()
        if (previous != null && previous != baseUrl) {
            tokenVault.clear()
            database.clearAllTables()
            attachments.clearPrivateFiles()
        }
        serverStore.saveServer(
            ServerProfile(baseUrl, capabilities.site.siteName, capabilities.site.siteIconUrl),
        )
        ServerConnection(capabilities, previous != null && previous != baseUrl)
    }

    suspend fun disconnect() {
        tokenVault.clear()
        database.clearAllTables()
        attachments.clearPrivateFiles()
        serverStore.clearServer()
    }
}
