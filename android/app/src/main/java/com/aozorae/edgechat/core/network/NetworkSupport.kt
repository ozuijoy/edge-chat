package com.aozorae.edgechat.core.network

import com.aozorae.edgechat.BuildConfig
import com.aozorae.edgechat.core.diagnostics.DiagnosticLog
import com.aozorae.edgechat.core.network.dto.ApiErrorEnvelope
import com.aozorae.edgechat.core.network.dto.MobileAuthResponse
import com.aozorae.edgechat.core.network.dto.RefreshRequest
import com.aozorae.edgechat.core.session.ServerStore
import com.aozorae.edgechat.core.session.StoredTokens
import com.aozorae.edgechat.core.session.TokenVault
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route

class EdgeChatApiException(val code: String, override val message: String, val status: Int) : IOException(message)

fun <T> retrofit2.Response<T>.bodyOrThrow(json: Json): T {
    if (isSuccessful) return body() ?: throw EdgeChatApiException("empty_response", "服务器返回空响应", code())
    val raw = errorBody()?.string().orEmpty()
    val error = runCatching { json.decodeFromString<ApiErrorEnvelope>(raw).error }.getOrNull()
    throw EdgeChatApiException(error?.code ?: "http_${code()}", error?.message ?: "请求失败", code())
}

@Singleton
class ServerUrlInterceptor @Inject constructor(private val serverStore: ServerStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.url.host != PLACEHOLDER_HOST) return chain.proceed(request)
        val base = runBlocking { serverStore.baseUrl() }
            ?: throw IOException("尚未配置 EdgeChat 服务器")
        val target = request.url.newBuilder()
            .scheme(java.net.URI(base).scheme)
            .host(java.net.URI(base).host)
            .port(java.net.URI(base).let { if (it.port > 0) it.port else if (it.scheme == "https") 443 else 80 })
            .build()
        return chain.proceed(request.newBuilder().url(target).build())
    }

    companion object {
        const val PLACEHOLDER_HOST = "edgechat.invalid"
    }
}

@Singleton
class AuthInterceptor @Inject constructor(private val tokenVault: TokenVault) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.url.encodedPath in PUBLIC_PATHS) return chain.proceed(request)
        val token = runBlocking { tokenVault.accessToken() }
        val authenticated = token?.let {
            request.newBuilder().header("Authorization", "Bearer $it").build()
        } ?: request
        return chain.proceed(authenticated)
    }

    private companion object {
        val PUBLIC_PATHS = setOf(
            "/api/v1/capabilities",
            "/api/v1/auth/login",
            "/api/v1/auth/refresh",
        )
    }
}

@Singleton
class SessionAuthenticator @Inject constructor(
    private val serverStore: ServerStore,
    private val tokenVault: TokenVault,
    private val json: Json,
    private val diagnostics: DiagnosticLog,
) : Authenticator {
    private val refreshClient = OkHttpClient.Builder().build()
    private val lock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.url.encodedPath.endsWith("/auth/refresh") || responseCount(response) > 1) {
            return null
        }
        return synchronized(lock) {
            runBlocking {
                val failedToken = response.request.header("Authorization")?.removePrefix("Bearer ")
                val current = tokenVault.read() ?: return@runBlocking null
                if (current.accessToken != failedToken) {
                    return@runBlocking response.request.newBuilder()
                        .header("Authorization", "Bearer ${current.accessToken}")
                        .build()
                }
                val base = serverStore.baseUrl() ?: return@runBlocking null
                val installationId = serverStore.installationId()
                val body = json.encodeToString(RefreshRequest(current.refreshToken, installationId))
                    .toRequestBody("application/json".toMediaType())
                val refreshRequest = Request.Builder()
                    .url("${base}api/v1/auth/refresh")
                    .post(body)
                    .build()
                val refreshed = runCatching {
                    refreshClient.newCall(refreshRequest).execute().use { call ->
                        if (!call.isSuccessful) return@use null
                        call.body?.string()?.let { json.decodeFromString<MobileAuthResponse>(it) }
                    }
                }.getOrNull()
                if (refreshed == null) {
                    diagnostics.record("session_refresh_failed status=${response.code}")
                    tokenVault.clear()
                    return@runBlocking null
                }
                tokenVault.save(
                    StoredTokens(
                        refreshed.accessToken,
                        refreshed.refreshToken,
                        refreshed.accessTokenExpiresAt,
                        refreshed.refreshTokenExpiresAt,
                    ),
                )
                response.request.newBuilder()
                    .header("Authorization", "Bearer ${refreshed.accessToken}")
                    .build()
            }
        }
    }

    private fun responseCount(response: Response): Int {
        var current: Response? = response
        var count = 0
        while (current != null) {
            count += 1
            current = current.priorResponse
        }
        return count
    }
}
