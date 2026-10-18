package com.aozorae.edgechat.core.media

import kotlin.math.roundToInt

data class VoiceRecordingState(
    val active: Boolean = false,
    val elapsedMs: Long = 0,
    val waveform: List<Int> = emptyList(),
)

data class VoicePlaybackState(
    val playbackId: String? = null,
    val playing: Boolean = false,
    val positionMs: Long = 0,
    val durationMs: Long = 0,
    val speed: Float = 1f,
    val failed: Boolean = false,
)

fun normalizeVoiceWaveform(samples: List<Int>, targetCount: Int = 48): List<Int> {
    val values = samples.map { it.coerceIn(0, 100) }
    if (values.size <= targetCount) return values
    return List(targetCount) { index ->
        val start = index * values.size / targetCount
        val end = ((index + 1) * values.size / targetCount).coerceAtLeast(start + 1)
        values.subList(start, end).max()
    }
}

fun fallbackVoiceWaveform(seed: String, count: Int = 42): List<Int> {
    var state = seed.fold(2_166_136_261L) { hash, character ->
        (hash * 31 + character.code).and(0xffffffffL)
    }
    return List(count) { index ->
        state = (state * 1_664_525 + 1_013_904_223).and(0xffffffffL)
        val envelope = 0.68 + 0.32 * kotlin.math.sin(index.toDouble() / (count - 1).coerceAtLeast(1) * Math.PI)
        ((24 + state % 68) * envelope).roundToInt().coerceIn(8, 100)
    }
}

fun formatVoiceDuration(durationMs: Long): String {
    val totalSeconds = (durationMs.coerceAtLeast(0) / 1000).toInt()
    return "%d:%02d".format(totalSeconds / 60, totalSeconds % 60)
}
