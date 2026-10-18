package com.aozorae.edgechat.core.realtime

import com.aozorae.edgechat.core.diagnostics.DiagnosticLog
import com.aozorae.edgechat.core.network.EdgeChatApi
import com.aozorae.edgechat.core.network.bodyOrThrow
import com.aozorae.edgechat.core.network.dto.RealtimeEnvelope
import com.aozorae.edgechat.core.network.dto.TicketRequest
import com.aozorae.edgechat.core.repository.ChatRepository
import com.aozorae.edgechat.core.repository.RoomIdentity
import com.aozorae.edgechat.core.session.ServerStore
import com.aozorae.edgechat.core.session.TokenVault
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

@Singleton
class RealtimeCoordinator @Inject constructor(
    private val api: EdgeChatApi,
    private val client: OkHttpClient,
    private val serverStore: ServerStore,
    private val tokenVault: TokenVault,
    private val chatRepository: ChatRepository,
    private val json: Json,
    private val diagnostics: DiagnosticLog,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val connections = ConcurrentHashMap<String, WebSocket>()
    private val reconnectJobs = ConcurrentHashMap<String, Job>()
    @Volatile private var foreground = false
    @Volatile private var currentRoom: RoomIdentity? = null
    @Volatile private var generation = 0L

    fun start() {
        foreground = true
        generation += 1
        val activeGeneration = generation
        scope.launch {
            if (tokenVault.read() == null || serverStore.baseUrl() == null) return@launch
            runCatching {
                chatRepository.bootstrap()
                currentRoom?.let { chatRepository.sync(it) }
            }.onFailure { diagnostics.record("foreground_sync_failed reason=${it.javaClass.simpleName}") }
            connect("inbox", null, activeGeneration, 0)
            currentRoom?.let { connect(roomKey(it), it, activeGeneration, 0) }
        }
    }

    fun stop() {
        foreground = false
        generation += 1
        reconnectJobs.values.forEach(Job::cancel)
        reconnectJobs.clear()
        connections.values.forEach { it.close(1000, "background") }
        connections.clear()
    }

    fun setRoom(room: RoomIdentity?) {
        val previous = currentRoom
        if (previous == room) return
        currentRoom = room
        previous?.let { key ->
            val socketKey = roomKey(key)
            reconnectJobs.remove(socketKey)?.cancel()
            connections.remove(socketKey)?.close(1000, "room_changed")
        }
        if (foreground && room != null) connect(roomKey(room), room, generation, 0)
    }

    private fun connect(key: String, room: RoomIdentity?, expectedGeneration: Long, attempt: Int) {
        reconnectJobs.remove(key)?.cancel()
        reconnectJobs[key] = scope.launch {
            if (!foreground || generation != expectedGeneration) return@launch
            if (tokenVault.read() == null || serverStore.baseUrl() == null) return@launch
            if (attempt > 0) delay(RECONNECT_DELAYS[(attempt - 1).coerceAtMost(RECONNECT_DELAYS.lastIndex)])
            runCatching {
                val request = if (room == null) {
                    TicketRequest(scope = "inbox")
                } else {
                    TicketRequest(scope = "room", roomKind = room.kind, roomId = room.id)
                }
                val ticket = api.realtimeTicket(request).bodyOrThrow(json).ticket
                val base = requireNotNull(serverStore.baseUrl()).toHttpUrl()
                val wsUrl = base.newBuilder()
                    .scheme(if (base.isHttps) "wss" else "ws")
                    .addPathSegments("api/v1/realtime/ws")
                    .addQueryParameter("ticket", ticket)
                    .build()
                val socket = client.newWebSocket(
                    Request.Builder().url(wsUrl).build(),
                    listener(key, room, expectedGeneration, attempt),
                )
                connections.put(key, socket)?.cancel()
            }.onFailure {
                diagnostics.record("realtime_connect_failed scope=$key reason=${it.javaClass.simpleName}")
                scheduleReconnect(key, room, expectedGeneration, attempt + 1)
            }
        }
    }

    private fun listener(
        key: String,
        room: RoomIdentity?,
        expectedGeneration: Long,
        attempt: Int,
    ) = object : WebSocketListener() {
        override fun onMessage(webSocket: WebSocket, text: String) {
            if (generation != expectedGeneration || connections[key] !== webSocket) return
            val envelope = runCatching { json.decodeFromString<RealtimeEnvelope>(text) }.getOrNull()
            if (envelope == null || envelope.protocolVersion != 1) {
                diagnostics.record("realtime_frame_rejected scope=$key")
                return
            }
            scope.launch {
                runCatching { chatRepository.handleRealtime(envelope, room) }
                    .onFailure { diagnostics.record("realtime_apply_failed scope=$key") }
            }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            val wasCurrent = connections.remove(key, webSocket)
            if (wasCurrent && code !in NON_RETRYABLE_CODES) {
                scheduleReconnect(key, room, expectedGeneration, attempt + 1)
            }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            val wasCurrent = connections.remove(key, webSocket)
            diagnostics.record("realtime_failure scope=$key status=${response?.code ?: 0}")
            if (wasCurrent && response?.code !in listOf(401, 403)) {
                scheduleReconnect(key, room, expectedGeneration, attempt + 1)
            }
        }
    }

    private fun scheduleReconnect(
        key: String,
        room: RoomIdentity?,
        expectedGeneration: Long,
        attempt: Int,
    ) {
        if (!foreground || generation != expectedGeneration) return
        connect(key, room, expectedGeneration, attempt)
    }

    private fun roomKey(room: RoomIdentity) = "room:${room.kind}:${room.id}"

    private companion object {
        val RECONNECT_DELAYS = listOf(1_000L, 2_000L, 5_000L)
        val NON_RETRYABLE_CODES = setOf(1000, 1008, 4401, 4403)
    }
}
