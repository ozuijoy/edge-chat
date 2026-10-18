package com.aozorae.edgechat.feature.chat

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aozorae.edgechat.core.media.VoicePlaybackState
import com.aozorae.edgechat.core.media.fallbackVoiceWaveform
import com.aozorae.edgechat.core.media.formatVoiceDuration
import com.aozorae.edgechat.ui.theme.LocalEdgeChatColors

@Composable
fun VoiceMessageBubble(
    playbackId: String,
    name: String,
    url: String,
    durationMs: Long,
    waveform: List<Int>,
    voiceNote: Boolean,
    playback: VoicePlaybackState,
    language: String,
    onToggle: (String, String, Long) -> Unit,
    onSeek: (String, Float) -> Unit,
    onCycleSpeed: (String) -> Unit,
    onFallback: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalEdgeChatColors.current
    val active = playback.playbackId == playbackId
    val effectiveDuration = if (active && playback.durationMs > 0) playback.durationMs else durationMs
    val progress = if (active && effectiveDuration > 0) {
        playback.positionMs.toFloat() / effectiveDuration
    } else {
        0f
    }.coerceIn(0f, 1f)
    val samples = waveform.ifEmpty { fallbackVoiceWaveform(playbackId) }

    Row(modifier.width(250.dp), verticalAlignment = Alignment.CenterVertically) {
        if (active && playback.failed) {
            IconButton(onClick = onFallback, modifier = Modifier.size(42.dp)) {
                Icon(
                    Icons.Outlined.Download,
                    contentDescription = if (language == "zh-CN") "下载语音" else "Download voice message",
                    tint = colors.accent,
                )
            }
        } else {
            IconButton(
                onClick = { onToggle(playbackId, url, durationMs) },
                modifier = Modifier.size(42.dp).testTag("voice_play:$playbackId"),
            ) {
                Icon(
                    if (active && playback.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = if (active && playback.playing) {
                        if (language == "zh-CN") "暂停语音" else "Pause voice message"
                    } else {
                        if (language == "zh-CN") "播放语音" else "Play voice message"
                    },
                    tint = colors.accent,
                )
            }
        }
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            if (!voiceNote) {
                Text(
                    name,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelMedium,
                    color = colors.textPrimary,
                )
            }
            Canvas(
                Modifier
                    .fillMaxWidth()
                    .height(28.dp)
                    .pointerInput(playbackId, effectiveDuration) {
                        detectTapGestures { offset -> onSeek(playbackId, offset.x / size.width) }
                    }
                    .testTag("voice_waveform:$playbackId"),
            ) {
                val gap = 2.dp.toPx()
                val barWidth = ((size.width - gap * (samples.size - 1)) / samples.size).coerceAtLeast(1.dp.toPx())
                samples.forEachIndexed { index, sample ->
                    val barHeight = size.height * (sample.coerceAtLeast(8) / 100f)
                    drawRoundRect(
                        color = if (index.toFloat() / samples.size <= progress) colors.accent else colors.iconSecondary,
                        topLeft = Offset(index * (barWidth + gap), (size.height - barHeight) / 2),
                        size = Size(barWidth, barHeight),
                        cornerRadius = CornerRadius(barWidth / 2),
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    formatVoiceDuration(if (active && playback.positionMs > 0) playback.positionMs else effectiveDuration),
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.textSecondary,
                )
                TextButton(
                    onClick = { onCycleSpeed(playbackId) },
                    modifier = Modifier.height(28.dp),
                ) {
                    Text(
                        text = "${if (active) playback.speed else 1f}x".replace(".0", ""),
                        style = MaterialTheme.typography.labelSmall,
                        color = colors.textSecondary,
                    )
                }
            }
        }
    }
}
