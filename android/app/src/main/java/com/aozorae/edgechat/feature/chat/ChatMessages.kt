package com.aozorae.edgechat.feature.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aozorae.edgechat.core.database.MessageEntity
import com.aozorae.edgechat.core.database.OutboxEntity
import com.aozorae.edgechat.core.database.decodeMentionUserIds
import com.aozorae.edgechat.core.database.decodeVoiceWaveform
import com.aozorae.edgechat.core.media.VoicePlaybackState
import com.aozorae.edgechat.core.network.dto.MemberDto
import com.aozorae.edgechat.core.network.dto.SessionDto
import com.aozorae.edgechat.ui.components.EdgeAvatar
import com.aozorae.edgechat.ui.components.resolveServerUrl
import com.aozorae.edgechat.ui.formatDayLabel
import com.aozorae.edgechat.ui.formatMessageTime
import com.aozorae.edgechat.ui.messageDate
import com.aozorae.edgechat.ui.theme.LocalEdgeChatColors
import java.io.File
import kotlinx.coroutines.launch

private enum class MessageGroupPosition {
    None,
    First,
    Middle,
    Last,
}

@Composable
fun ChatMessages(
    messages: List<MessageEntity>,
    outbox: List<OutboxEntity>,
    currentUser: SessionDto,
    members: List<MemberDto> = emptyList(),
    serverBaseUrl: String,
    language: String,
    scrollState: LazyListState,
    onLoadOlder: () -> Unit,
    onRetry: (String) -> Unit,
    onCancel: (String) -> Unit,
    onDeleteMessage: (Long) -> Unit,
	onOpenAttachment: (String, String, String) -> Unit,
	voicePlayback: VoicePlaybackState = VoicePlaybackState(),
	onToggleVoicePlayback: (String, String, Long) -> Unit = { _, _, _ -> },
	onSeekVoicePlayback: (String, Float) -> Unit = { _, _ -> },
	onCycleVoicePlaybackSpeed: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val colors = LocalEdgeChatColors.current
    Box(modifier) {
        if (messages.isEmpty() && outbox.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Surface(color = colors.subtleSecondary, shape = MaterialTheme.shapes.extraLarge) {
                    Icon(
                        Icons.Outlined.Forum,
                        contentDescription = null,
                        modifier = Modifier.padding(18.dp).size(32.dp),
                        tint = colors.iconSecondary,
                    )
                }
                Spacer(Modifier.height(16.dp))
                Text(
                    text = if (language == "zh-CN") "这里还没有消息" else "No messages here yet",
                    style = MaterialTheme.typography.titleSmall,
                    color = colors.textPrimary,
                )
            }
        }
        LazyColumn(
            state = scrollState,
            reverseLayout = true,
            modifier = Modifier.fillMaxSize().testTag("message_list"),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 12.dp),
        ) {
            outbox.asReversed().forEach { pending ->
                item(key = "pending:${pending.clientMessageId}") {
                    PendingMessageItem(
                        item = pending,
                        language = language,
                        onRetry = onRetry,
                        onCancel = onCancel,
                    )
                }
            }

            val newestFirst = messages.asReversed()
            newestFirst.forEachIndexed { index, message ->
                val newer = newestFirst.getOrNull(index - 1)
                val older = newestFirst.getOrNull(index + 1)
                item(key = message.id) {
                    MessageItem(
                        message = message,
                        own = message.senderKind == "local" && message.senderId == currentUser.userId.toString(),
                        groupPosition = messageGroupPosition(message, newer, older),
                        showAuthor = startsMessageGroup(message, older),
                        currentUser = currentUser,
                        members = members,
                        serverBaseUrl = serverBaseUrl,
                        language = language,
                        onDelete = onDeleteMessage,
					onOpenAttachment = onOpenAttachment,
					voicePlayback = voicePlayback,
					onToggleVoicePlayback = onToggleVoicePlayback,
					onSeekVoicePlayback = onSeekVoicePlayback,
					onCycleVoicePlaybackSpeed = onCycleVoicePlaybackSpeed,
                    )
                }
                if (older == null || messageDate(older.createdAt) != messageDate(message.createdAt)) {
                    item(key = "day:${messageDate(message.createdAt)}") {
                        DayHeader(formatDayLabel(message.createdAt, language))
                    }
                }
            }

            item(key = "load-older") {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    TextButton(onClick = onLoadOlder, modifier = Modifier.padding(vertical = 6.dp)) {
                        Icon(Icons.Outlined.Refresh, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text(if (language == "zh-CN") "加载更早消息" else "Load older messages")
                    }
                }
            }
        }

        val threshold = with(LocalDensity.current) { 56.dp.toPx() }
        val showJump by remember(scrollState) {
            derivedStateOf {
                scrollState.firstVisibleItemIndex > 0 || scrollState.firstVisibleItemScrollOffset > threshold
            }
        }
        AnimatedVisibility(
            visible = showJump,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp),
            enter = fadeIn() + scaleIn(),
            exit = fadeOut() + scaleOut(),
        ) {
            SmallFloatingActionButton(
                onClick = { scope.launch { scrollState.animateScrollToItem(0) } },
                containerColor = colors.canvasLevel1,
                contentColor = colors.iconPrimary,
            ) {
                Icon(
                    Icons.Outlined.KeyboardArrowDown,
                    contentDescription = if (language == "zh-CN") "回到最新消息" else "Jump to latest message",
                )
            }
        }
    }
}

internal fun startsMessageGroup(message: MessageEntity, older: MessageEntity?): Boolean =
    older == null ||
        messageDate(older.createdAt) != messageDate(message.createdAt) ||
        older.senderKind != message.senderKind ||
        older.senderId != message.senderId

private fun messageGroupPosition(
    message: MessageEntity,
    newer: MessageEntity?,
    older: MessageEntity?,
): MessageGroupPosition {
    fun MessageEntity?.sameGroup(): Boolean =
        this != null &&
            senderKind == message.senderKind &&
            senderId == message.senderId &&
            messageDate(createdAt) == messageDate(message.createdAt)

    val hasNewer = newer.sameGroup()
    val hasOlder = older.sameGroup()
    return when {
        !hasOlder && !hasNewer -> MessageGroupPosition.None
        !hasOlder && hasNewer -> MessageGroupPosition.First
        hasOlder && hasNewer -> MessageGroupPosition.Middle
        else -> MessageGroupPosition.Last
    }
}

@Composable
private fun MessageItem(
    message: MessageEntity,
    own: Boolean,
    groupPosition: MessageGroupPosition,
    showAuthor: Boolean,
    currentUser: SessionDto,
    members: List<MemberDto>,
    serverBaseUrl: String,
    language: String,
    onDelete: (Long) -> Unit,
	onOpenAttachment: (String, String, String) -> Unit,
	voicePlayback: VoicePlaybackState,
	onToggleVoicePlayback: (String, String, Long) -> Unit,
	onSeekVoicePlayback: (String, Float) -> Unit,
	onCycleVoicePlaybackSpeed: (String) -> Unit,
) {
    val colors = LocalEdgeChatColors.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = if (showAuthor) 10.dp else 2.dp),
        verticalAlignment = Alignment.Top,
    ) {
        if (!own) {
            if (showAuthor) {
                EdgeAvatar(
                    imageUrl = resolveServerUrl(serverBaseUrl, message.senderAvatarUrl),
                    displayName = message.senderDisplayName,
                    modifier = Modifier.padding(end = 8.dp).size(36.dp),
                )
            } else {
                Spacer(Modifier.width(44.dp))
            }
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = if (own) 52.dp else 0.dp, end = if (own) 4.dp else 48.dp),
            horizontalAlignment = if (own) Alignment.End else Alignment.Start,
        ) {
            if (showAuthor && !own) {
                Row(
                    modifier = Modifier.padding(start = 4.dp, bottom = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = message.senderDisplayName,
                        style = MaterialTheme.typography.labelLarge,
                        color = colors.textPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (message.source != "edgechat") {
                        Spacer(Modifier.width(8.dp))
                        Surface(color = colors.accentSubtle, shape = MaterialTheme.shapes.small) {
                            Text(
                                text = "Telegram",
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall,
                                color = colors.onAccentSubtle,
                            )
                        }
                    }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = if (own) Arrangement.End else Arrangement.Start,
                verticalAlignment = Alignment.Bottom,
            ) {
                if (own) {
                    IconButton(onClick = { onDelete(message.id) }, modifier = Modifier.size(36.dp)) {
                        Icon(
                            Icons.Outlined.DeleteOutline,
                            contentDescription = if (language == "zh-CN") "删除消息" else "Delete message",
                            modifier = Modifier.size(19.dp),
                            tint = colors.iconSecondary,
                        )
                    }
                }
                MessageBubble(
                    message = message,
                    own = own,
                    groupPosition = groupPosition,
                    currentUser = currentUser,
                    members = members,
                    serverBaseUrl = serverBaseUrl,
                    language = language,
					onOpenAttachment = onOpenAttachment,
					voicePlayback = voicePlayback,
					onToggleVoicePlayback = onToggleVoicePlayback,
					onSeekVoicePlayback = onSeekVoicePlayback,
					onCycleVoicePlaybackSpeed = onCycleVoicePlaybackSpeed,
                    modifier = Modifier.testTag("message_bubble:${message.id}"),
                )
            }
        }
    }
}

@Composable
private fun MessageBubble(
    message: MessageEntity,
    own: Boolean,
    groupPosition: MessageGroupPosition,
    currentUser: SessionDto,
    members: List<MemberDto>,
    serverBaseUrl: String,
    language: String,
	onOpenAttachment: (String, String, String) -> Unit,
	voicePlayback: VoicePlaybackState,
	onToggleVoicePlayback: (String, String, Long) -> Unit,
	onSeekVoicePlayback: (String, Float) -> Unit,
	onCycleVoicePlaybackSpeed: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalEdgeChatColors.current
    BoxWithConstraints {
        Surface(
            modifier = modifier.widthIn(min = 80.dp, max = maxWidth * 0.78f),
            color = if (own) colors.messageFromMe else colors.messageFromOther,
            contentColor = colors.textPrimary,
            shape = messageBubbleShape(groupPosition, own),
        ) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                if (message.content.isNotBlank()) {
                    val ranges = findMentionRanges(
                        message.content,
                        members,
                        decodeMentionUserIds(message.mentionUserIds),
                    )
                    val annotatedContent = buildAnnotatedString {
                        append(message.content)
                        ranges.forEach { range ->
                            addStyle(
                                SpanStyle(
                                    color = colors.accent,
                                    background = if (range.userId == currentUser.userId) {
                                        colors.accentSubtle
                                    } else {
                                        androidx.compose.ui.graphics.Color.Unspecified
                                    },
                                    fontWeight = FontWeight.SemiBold,
                                ),
                                range.start,
                                range.end,
                            )
                        }
                    }
                    Text(annotatedContent, style = MaterialTheme.typography.bodyLarge)
                }
                val attachmentUrl = message.attachmentUrl
                if (attachmentUrl != null) {
                    if (message.content.isNotBlank()) Spacer(Modifier.height(8.dp))
                    val attachmentName = message.attachmentName ?: "attachment"
                    val attachmentType = message.attachmentType ?: "application/octet-stream"
                    val openAttachment = {
                        onOpenAttachment(attachmentUrl, attachmentName, attachmentType)
                    }
					if (attachmentType.startsWith("audio/")) {
						VoiceMessageBubble(
							playbackId = "message:${message.id}",
							name = attachmentName,
							url = resolveServerUrl(serverBaseUrl, attachmentUrl),
							durationMs = message.attachmentDurationMs ?: 0,
							waveform = decodeVoiceWaveform(message.attachmentWaveform),
							voiceNote = message.attachmentKind == "voice",
							playback = voicePlayback,
							language = language,
							onToggle = onToggleVoicePlayback,
							onSeek = onSeekVoicePlayback,
							onCycleSpeed = onCycleVoicePlaybackSpeed,
							onFallback = openAttachment,
							modifier = Modifier.testTag("message_voice:${message.id}"),
						)
					} else if (isImageAttachment(attachmentType)) {
                        MessageImageAttachment(
                            model = resolveServerUrl(serverBaseUrl, attachmentUrl),
                            name = attachmentName,
                            language = language,
                            tag = "message_image:${message.id}",
                            onClick = openAttachment,
                        )
                    } else {
                        AttachmentTile(
                            name = attachmentName,
                            type = attachmentType,
                            language = language,
                            onClick = openAttachment,
                            modifier = Modifier.testTag("message_attachment:${message.id}"),
                        )
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = formatMessageTime(message.createdAt, language),
                    modifier = Modifier.align(Alignment.End),
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.textSecondary,
                )
            }
        }
    }
}

private fun messageBubbleShape(position: MessageGroupPosition, own: Boolean): RoundedCornerShape {
    val radius = 12.dp
    return when (position) {
        MessageGroupPosition.None -> RoundedCornerShape(radius)
        MessageGroupPosition.First -> if (own) {
            RoundedCornerShape(radius, radius, 0.dp, radius)
        } else {
            RoundedCornerShape(4.dp, radius, radius, 0.dp)
        }
        MessageGroupPosition.Middle -> if (own) {
            RoundedCornerShape(radius, 0.dp, 0.dp, radius)
        } else {
            RoundedCornerShape(0.dp, radius, radius, 0.dp)
        }
        MessageGroupPosition.Last -> if (own) {
            RoundedCornerShape(radius, 0.dp, radius, radius)
        } else {
            RoundedCornerShape(0.dp, radius, radius, radius)
        }
    }
}

@Composable
private fun AttachmentTile(
    name: String,
    type: String,
    language: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalEdgeChatColors.current
    Surface(
        color = colors.canvas.copy(alpha = 0.72f),
        shape = MaterialTheme.shapes.small,
        modifier = modifier.clickable(
            role = Role.Button,
            onClickLabel = if (language == "zh-CN") "打开附件" else "Open attachment",
            onClick = onClick,
        ),
    ) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = when {
                    type.startsWith("image/") -> Icons.Outlined.Image
                    type.startsWith("video/") -> Icons.Outlined.Movie
                    else -> Icons.Outlined.Description
                },
                contentDescription = null,
                tint = colors.iconSecondary,
            )
            Spacer(Modifier.width(8.dp))
            Text(
                name,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
            )
            Icon(Icons.Outlined.Download, contentDescription = null, modifier = Modifier.size(18.dp), tint = colors.iconSecondary)
        }
    }
}

@Composable
private fun PendingMessageItem(
    item: OutboxEntity,
    language: String,
    onRetry: (String) -> Unit,
    onCancel: (String) -> Unit,
) {
    val colors = LocalEdgeChatColors.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp, start = 52.dp, end = 4.dp),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.Bottom,
    ) {
        if (item.state == "RETRY") {
            IconButton(onClick = { onRetry(item.clientMessageId) }, modifier = Modifier.size(36.dp)) {
                Icon(Icons.Outlined.Refresh, contentDescription = if (language == "zh-CN") "重试发送" else "Retry sending")
            }
        }
        IconButton(onClick = { onCancel(item.clientMessageId) }, modifier = Modifier.size(36.dp)) {
            Icon(Icons.Outlined.Close, contentDescription = if (language == "zh-CN") "取消发送" else "Cancel sending")
        }
        BoxWithConstraints {
            Surface(
                color = colors.messageFromMe,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .widthIn(min = 80.dp, max = maxWidth * 0.78f)
                    .testTag("pending_message_bubble:${item.clientMessageId}"),
            ) {
                Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                    if (item.content.isNotBlank()) Text(item.content, style = MaterialTheme.typography.bodyLarge)
                    item.attachmentName?.let { attachmentName ->
                        if (item.content.isNotBlank()) Spacer(Modifier.height(6.dp))
                        val localPath = item.localAttachmentPath
						if (item.attachmentKind == "voice") {
							PendingVoiceMessage(item)
						} else if (localPath != null && isImageAttachment(item.attachmentType)) {
                            MessageImageAttachment(
                                model = File(localPath),
                                name = attachmentName,
                                language = language,
                                tag = "pending_message_image:${item.clientMessageId}",
                                onClick = null,
                            )
                        } else {
                            Text(attachmentName, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Spacer(Modifier.height(5.dp))
                    Text(
                        text = when (item.state) {
                            "UPLOADING" -> if (language == "zh-CN") "正在上传" else "Uploading"
                            "SENDING" -> if (language == "zh-CN") "正在发送" else "Sending"
                            "RETRY" -> item.failure ?: if (language == "zh-CN") "发送失败" else "Failed"
                            else -> if (language == "zh-CN") "等待发送" else "Queued"
                        },
                        modifier = Modifier.align(Alignment.End),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (item.state == "RETRY") colors.critical else colors.textSecondary,
                    )
                }
            }
        }
    }
}

@Composable
private fun PendingVoiceMessage(item: OutboxEntity) {
    val colors = LocalEdgeChatColors.current
    val samples = decodeVoiceWaveform(item.attachmentWaveform).ifEmpty { List(32) { 24 } }
    Row(Modifier.width(230.dp), verticalAlignment = Alignment.CenterVertically) {
		Icon(Icons.Outlined.Mic, contentDescription = null, tint = colors.accent)
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Canvas(Modifier.fillMaxWidth().height(24.dp)) {
                val gap = 2.dp.toPx()
                val barWidth = ((size.width - gap * (samples.size - 1)) / samples.size).coerceAtLeast(1.dp.toPx())
                samples.forEachIndexed { index, sample ->
                    val height = size.height * sample.coerceAtLeast(8) / 100f
                    drawRoundRect(
                        color = colors.accent,
                        topLeft = androidx.compose.ui.geometry.Offset(index * (barWidth + gap), (size.height - height) / 2),
                        size = androidx.compose.ui.geometry.Size(barWidth, height),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(barWidth / 2),
                    )
                }
            }
            Text(
                com.aozorae.edgechat.core.media.formatVoiceDuration(item.attachmentDurationMs ?: 0),
                style = MaterialTheme.typography.labelSmall,
                color = colors.textSecondary,
            )
        }
    }
}

@Composable
private fun DayHeader(label: String) {
    val colors = LocalEdgeChatColors.current
    Box(Modifier.fillMaxWidth().padding(vertical = 12.dp), contentAlignment = Alignment.Center) {
        Surface(color = colors.canvasLevel1, shape = MaterialTheme.shapes.extraLarge) {
            Text(
                text = label,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
                style = MaterialTheme.typography.labelSmall,
                color = colors.textSecondary,
            )
        }
    }
}
