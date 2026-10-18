package com.aozorae.edgechat.feature.chat

import androidx.compose.foundation.border
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aozorae.edgechat.core.repository.PendingAttachment
import com.aozorae.edgechat.core.network.dto.MemberDto
import com.aozorae.edgechat.core.media.VoiceRecordingState
import com.aozorae.edgechat.core.media.formatVoiceDuration
import com.aozorae.edgechat.ui.theme.LocalEdgeChatColors

@Composable
fun MessageComposer(
    roomKey: String,
    roomTitle: String,
    attachment: PendingAttachment?,
    language: String,
    members: List<MemberDto>,
	currentUserId: Long,
	recording: VoiceRecordingState = VoiceRecordingState(),
	onChooseAttachment: () -> Unit,
	onClearAttachment: () -> Unit,
	onStartVoiceRecording: () -> Unit = {},
	onCancelVoiceRecording: () -> Unit = {},
	onSendVoiceRecording: () -> Unit = {},
    onSend: (String, List<Long>) -> Unit,
    modifier: Modifier = Modifier,
) {
    var content by rememberSaveable(roomKey, stateSaver = TextFieldValue.Saver) {
        mutableStateOf(TextFieldValue())
    }
    val canSend = content.text.isNotBlank() || attachment != null
    val colors = LocalEdgeChatColors.current
    val activeMention = findActiveMentionQuery(content.text, content.selection.start)
    val mentionCandidates = activeMention?.let { active ->
        members
            .filter { member ->
                member.id != currentUserId && (
                    active.query.isBlank() ||
                        member.username.contains(active.query, ignoreCase = true) ||
                        member.displayName.contains(active.query, ignoreCase = true)
                )
            }
            .take(8)
    }.orEmpty()

    Surface(modifier = modifier, color = colors.canvas) {
        Column {
            HorizontalDivider(color = colors.separator)
            attachment?.let {
                Surface(
                    modifier = Modifier.fillMaxWidth().padding(start = 64.dp, end = 16.dp, top = 10.dp),
                    color = colors.subtleSecondary,
                    shape = MaterialTheme.shapes.medium,
                ) {
                    Row(
                        modifier = Modifier.padding(start = 12.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Outlined.AttachFile, contentDescription = null, tint = colors.iconSecondary)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            it.name,
                            modifier = Modifier.weight(1f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        IconButton(onClick = onClearAttachment) {
                            Icon(Icons.Outlined.Close, contentDescription = if (language == "zh-CN") "移除附件" else "Remove attachment")
                        }
                    }
                }
            }
            if (mentionCandidates.isNotEmpty()) {
                Surface(
                    modifier = Modifier.fillMaxWidth().padding(start = 64.dp, end = 60.dp, top = 6.dp),
                    color = colors.canvasLevel1,
                    shape = RoundedCornerShape(8.dp),
                    tonalElevation = 3.dp,
                ) {
                    Column(Modifier.padding(vertical = 4.dp)) {
                        mentionCandidates.forEach { member ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .clickable {
                                        val active = activeMention ?: return@clickable
                                        val replacement = "@${member.username} "
                                        val nextText = content.text.replaceRange(active.start, active.end, replacement)
                                        val nextCursor = active.start + replacement.length
                                        content = TextFieldValue(nextText, TextRange(nextCursor))
                                    }
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column {
                                    Text(member.displayName, style = MaterialTheme.typography.bodyMedium, color = colors.textPrimary)
                                    Text("@${member.username}", style = MaterialTheme.typography.labelMedium, color = colors.textSecondary)
                                }
                            }
                        }
                    }
                }
            }
			if (recording.active) {
				VoiceRecordingBar(
					recording = recording,
					language = language,
					onCancel = onCancelVoiceRecording,
					onSend = onSendVoiceRecording,
				)
			} else Row(
				modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min).padding(horizontal = 8.dp, vertical = 8.dp),
				verticalAlignment = Alignment.Bottom,
			) {
                FilledIconButton(
                    onClick = onChooseAttachment,
                    modifier = Modifier.size(48.dp),
                    shape = CircleShape,
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = colors.iconPrimary,
                        contentColor = colors.canvas,
                    ),
                ) {
                    Icon(Icons.Outlined.Add, contentDescription = if (language == "zh-CN") "选择附件" else "Choose attachment")
                }
                Spacer(Modifier.width(8.dp))
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 42.dp, max = 128.dp)
                        .border(0.5.dp, colors.subtlePrimary, RoundedCornerShape(24.dp)),
                    shape = RoundedCornerShape(24.dp),
                    color = colors.subtleSecondary,
                ) {
                    BasicTextField(
                        value = content,
                        onValueChange = { content = it },
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 42.dp, max = 128.dp)
                            .padding(horizontal = 14.dp, vertical = 10.dp)
                            .testTag("message_input"),
                        textStyle = MaterialTheme.typography.bodyLarge.merge(TextStyle(color = colors.textPrimary)),
                        cursorBrush = SolidColor(colors.accent),
                        minLines = 1,
                        maxLines = 5,
                        decorationBox = { input ->
                            Box(contentAlignment = Alignment.CenterStart) {
                                if (content.text.isBlank()) {
                                    Text(
                                        text = if (language == "zh-CN") "发送消息到 $roomTitle" else "Message $roomTitle",
                                        color = colors.textSecondary,
                                        style = MaterialTheme.typography.bodyLarge,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                input()
                            }
                        },
                    )
                }
                Spacer(Modifier.width(4.dp))
				if (canSend) {
					IconButton(
						onClick = {
							onSend(content.text, resolveMentionUserIds(content.text, members, currentUserId))
							content = TextFieldValue()
						},
						modifier = Modifier.size(48.dp).testTag("send_message"),
					) {
						Icon(
							Icons.AutoMirrored.Filled.Send,
							contentDescription = if (language == "zh-CN") "发送消息" else "Send message",
							tint = colors.accent,
						)
					}
				} else {
					IconButton(
						onClick = onStartVoiceRecording,
						modifier = Modifier.size(48.dp).testTag("record_voice"),
					) {
						Icon(
							Icons.Outlined.Mic,
							contentDescription = if (language == "zh-CN") "录制语音消息" else "Record voice message",
							tint = colors.accent,
						)
					}
				}
			}
		}
	}
}

@Composable
private fun VoiceRecordingBar(
    recording: VoiceRecordingState,
    language: String,
    onCancel: () -> Unit,
    onSend: () -> Unit,
) {
    val colors = LocalEdgeChatColors.current
    Row(
        modifier = Modifier.fillMaxWidth().height(64.dp).padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onCancel, modifier = Modifier.size(48.dp).testTag("cancel_voice")) {
            Icon(
                Icons.Outlined.DeleteOutline,
                contentDescription = if (language == "zh-CN") "取消录音" else "Cancel recording",
                tint = colors.critical,
            )
        }
        Box(Modifier.size(8.dp).background(colors.critical, CircleShape))
        Spacer(Modifier.width(8.dp))
        Text(
            formatVoiceDuration(recording.elapsedMs),
            color = colors.textPrimary,
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.width(10.dp))
        val samples = recording.waveform.ifEmpty { List(24) { 8 } }
        Canvas(Modifier.weight(1f).height(28.dp)) {
            val gap = 2.dp.toPx()
            val barWidth = ((size.width - gap * (samples.size - 1)) / samples.size).coerceAtLeast(1.dp.toPx())
            samples.forEachIndexed { index, sample ->
                val barHeight = size.height * (sample.coerceAtLeast(8) / 100f)
                drawRoundRect(
                    color = colors.accent,
                    topLeft = androidx.compose.ui.geometry.Offset(index * (barWidth + gap), (size.height - barHeight) / 2),
                    size = androidx.compose.ui.geometry.Size(barWidth, barHeight),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(barWidth / 2),
                )
            }
        }
        IconButton(onClick = onSend, modifier = Modifier.size(48.dp).testTag("send_voice")) {
            Icon(
                Icons.AutoMirrored.Filled.Send,
                contentDescription = if (language == "zh-CN") "发送语音消息" else "Send voice message",
                tint = colors.accent,
            )
        }
    }
}
