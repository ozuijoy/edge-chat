package com.aozorae.edgechat.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive

@Serializable
data class SiteDto(val siteName: String = "EdgeChat", val siteIconUrl: String = "")

@Serializable
data class CapabilitiesResponse(
    val apiVersion: Int,
    val site: SiteDto,
    val limits: LimitsDto,
    val features: FeaturesDto,
)

@Serializable
data class LimitsDto(val maxUploadBytes: Long = 20L * 1024 * 1024, val messageRetentionDays: Int = 7)

@Serializable
data class FeaturesDto(
    val deviceSessions: Boolean = false,
    val realtimeTickets: Boolean = false,
    val idempotentMessages: Boolean = false,
    val idempotentUploads: Boolean = false,
    val roomSync: Boolean = false,
    val backgroundPush: Boolean = false,
)

@Serializable
data class DeviceDto(val installationId: String, val name: String, val appVersion: String)

@Serializable
data class LoginRequest(val username: String, val password: String, val device: DeviceDto)

@Serializable
data class RefreshRequest(val refreshToken: String, val installationId: String)

@Serializable
data class MobileAuthResponse(
    val accessToken: String,
    val accessTokenExpiresAt: String,
    val refreshToken: String,
    val refreshTokenExpiresAt: String,
    val session: SessionDto,
)

@Serializable
data class SessionDto(
    val userId: Long,
    val username: String,
    val displayName: String,
    val avatarUrl: String = "",
    val isAdmin: Boolean = false,
    val sessionVersion: Int = 0,
    val deviceSessionId: String? = null,
)

@Serializable
data class SessionResponse(val session: SessionDto)

@Serializable
data class UserDto(
    val id: Long,
    val username: String,
    val displayName: String,
    val avatarUrl: String = "",
)

@Serializable
data class ChannelDto(
    val id: Long,
    val name: String,
    val description: String = "",
    val avatarKey: String = "",
    val avatarUrl: String = "",
    val kind: String,
    val isGeneral: Boolean = false,
    val ownerDisplayName: String = "",
    val isMember: Boolean = true,
    val myRole: String = "",
    val canManage: Boolean = false,
    val memberCount: Int = 0,
    val lastMessageAt: String? = null,
    val unreadCount: Int = 0,
    val mentionUnreadCount: Int = 0,
)

@Serializable
data class DmDto(
    val id: Long,
    val kind: String = "dm",
    val name: String = "",
    val lastMessageAt: String? = null,
    val unreadCount: Int = 0,
    val otherUser: UserDto,
)

@Serializable
data class BootstrapResponse(
    val users: List<UserDto> = emptyList(),
    val channels: List<ChannelDto> = emptyList(),
    val dms: List<DmDto> = emptyList(),
)

@Serializable
data class SenderDto(
    val kind: String,
    @Serializable(with = FlexibleStringSerializer::class)
    val id: String,
    val username: String = "",
    val displayName: String,
    val avatarUrl: String = "",
    val source: String = "edgechat",
)

@Serializable
data class AttachmentDto(
	val key: String,
	val name: String,
	val type: String,
	val size: Long = 0,
	val url: String,
	val kind: String? = null,
	val durationMs: Long? = null,
	val waveform: List<Int> = emptyList(),
)

@Serializable
data class MentionDto(
    val userId: Long,
    val username: String,
    val displayName: String = "",
)

@Serializable
data class MessageDto(
    val id: Long,
    val clientMessageId: String? = null,
    val content: String = "",
    val createdAt: String,
    val source: String = "edgechat",
    val sender: SenderDto,
    val attachment: AttachmentDto? = null,
    val mentionUserIds: List<Long> = emptyList(),
    val mentions: List<MentionDto> = emptyList(),
)

@Serializable
data class RoomDto(val id: Long, val kind: String, val name: String, val description: String = "")

@Serializable
data class RoomMessagesResponse(
    val room: RoomDto,
    val messages: List<MessageDto>,
    val syncCursor: Long,
)

@Serializable
data class SyncEventDto(
    val sequence: Long,
    val type: String,
    val messageId: Long? = null,
    val message: MessageDto? = null,
    val createdAt: String? = null,
)

@Serializable
data class RoomSyncResponse(
    val events: List<SyncEventDto>,
    val nextCursor: Long,
    val hasMore: Boolean,
)

@Serializable
data class SendMessageRequest(
    val clientMessageId: String,
    val content: String,
    val attachment: AttachmentDto? = null,
    val mentionUserIds: List<Long> = emptyList(),
)

@Serializable
data class SendMessageResponse(val created: Boolean = true, val message: MessageDto)

@Serializable
data class ReadRequest(val messageId: Long? = null)

@Serializable
data class ReadResponse(val ok: Boolean, val lastReadMessageId: Long)

@Serializable
data class TicketRequest(val scope: String, val roomKind: String? = null, val roomId: Long? = null)

@Serializable
data class TicketResponse(val ticket: String, val expiresAt: String)

@Serializable
data class UploadResponse(val created: Boolean = true, val file: AttachmentDto)

@Serializable
data class ChannelsResponse(
    val channels: List<ChannelDto> = emptyList(),
    val publicChannels: List<ChannelDto> = emptyList(),
    val privateChannels: List<ChannelDto> = emptyList(),
)

@Serializable
data class CreateGroupRequest(
    val name: String,
    val description: String = "",
    val kind: String,
    val memberUserIds: List<Long> = emptyList(),
)

@Serializable
data class ChannelResponse(val channel: ChannelDto)

@Serializable
data class ChannelUpdateResponse(val channel: ChannelUpdateDto? = null, val ok: Boolean = true)

@Serializable
data class ChannelUpdateDto(
    val id: Long,
    val name: String,
    val avatarKey: String = "",
    val avatarUrl: String = "",
)

@Serializable
data class MemberDto(
    val id: Long,
    val username: String,
    val displayName: String,
    val avatarUrl: String = "",
    val role: String,
    val joinedAt: String = "",
)

@Serializable
data class MembersResponse(val room: ChannelDto, val members: List<MemberDto>)

@Serializable
data class InviteMembersRequest(val userIds: List<Long>)

@Serializable
data class MembersMutationResponse(val ok: Boolean, val members: List<MemberDto>)

@Serializable
data class UpdateChannelRequest(val name: String? = null, val avatarKey: String? = null)

@Serializable
data class OpenDmRequest(val userId: Long)

@Serializable
data class DmResponse(val dm: DmDto)

@Serializable
data class UpdateProfileRequest(
    val displayName: String,
    val avatarKey: String? = null,
    val clearAvatar: Boolean = false,
)

@Serializable
data class ChangePasswordRequest(val currentPassword: String, val newPassword: String)

@Serializable
data class OkResponse(val ok: Boolean)

@Serializable
data class ApiErrorEnvelope(val error: ApiErrorDto)

@Serializable
data class ApiErrorDto(val code: String = "invalid_request", val message: String)

@Serializable
data class RealtimeEnvelope(
    val protocolVersion: Int = 1,
    val type: String,
    val room: RoomDto? = null,
    val message: MessageDto? = null,
    val messageId: Long? = null,
    val createdAt: String? = null,
    val unreadCount: Int? = null,
    val mentionUnreadCount: Int? = null,
    val mentionsMe: Boolean = false,
    val contentPreview: String? = null,
    val sender: SenderDto? = null,
    val error: String? = null,
)

object FlexibleStringSerializer : KSerializer<String> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleString", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): String {
        val jsonDecoder = decoder as? JsonDecoder ?: return decoder.decodeString()
        return (jsonDecoder.decodeJsonElement() as JsonPrimitive).content
    }

    override fun serialize(encoder: Encoder, value: String) = encoder.encodeString(value)
}
