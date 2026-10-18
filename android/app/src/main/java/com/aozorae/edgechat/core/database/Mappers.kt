package com.aozorae.edgechat.core.database

import com.aozorae.edgechat.core.network.dto.ChannelDto
import com.aozorae.edgechat.core.network.dto.DmDto
import com.aozorae.edgechat.core.network.dto.MessageDto
import com.aozorae.edgechat.core.network.dto.UserDto

fun UserDto.toEntity() = UserEntity(id, username, displayName, avatarUrl)

fun ChannelDto.toEntity() = ConversationEntity(
    kind = kind,
    id = id,
    title = name,
    subtitle = description,
    avatarUrl = avatarUrl,
    isGeneral = isGeneral,
    isMember = isMember,
    canManage = canManage,
    myRole = myRole,
    memberCount = memberCount,
    otherUserId = null,
    lastMessageAt = lastMessageAt,
    unreadCount = unreadCount,
    mentionUnreadCount = mentionUnreadCount,
)

fun DmDto.toEntity() = ConversationEntity(
    kind = "dm",
    id = id,
    title = otherUser.displayName,
    subtitle = otherUser.username,
    avatarUrl = otherUser.avatarUrl,
    isGeneral = false,
    isMember = true,
    canManage = false,
    myRole = "member",
    memberCount = 2,
    otherUserId = otherUser.id,
    lastMessageAt = lastMessageAt,
    unreadCount = unreadCount,
    mentionUnreadCount = 0,
)

fun MessageDto.toEntity(kind: String, roomId: Long) = MessageEntity(
    id = id,
    roomKind = kind,
    roomId = roomId,
    clientMessageId = clientMessageId,
    content = content,
    createdAt = createdAt,
    source = source,
    senderKind = sender.kind,
    senderId = sender.id,
    senderUsername = sender.username,
    senderDisplayName = sender.displayName,
    senderAvatarUrl = sender.avatarUrl,
    attachmentKey = attachment?.key,
    attachmentName = attachment?.name,
    attachmentType = attachment?.type,
	attachmentSize = attachment?.size,
	attachmentUrl = attachment?.url,
	attachmentKind = attachment?.kind,
	attachmentDurationMs = attachment?.durationMs,
	attachmentWaveform = encodeVoiceWaveform(attachment?.waveform.orEmpty()),
	mentionUserIds = encodeMentionUserIds(mentionUserIds),
)
