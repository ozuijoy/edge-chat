package com.aozorae.edgechat.core.media

import org.junit.Assert.assertEquals
import org.junit.Test

class VoiceMediaTest {
    @Test
    fun durationAndWaveformStayCompact() {
        assertEquals("1:05", formatVoiceDuration(65_400))
        assertEquals(listOf(30, 90), normalizeVoiceWaveform(listOf(5, 30, 10, 90), 2))
        assertEquals(fallbackVoiceWaveform("same", 8), fallbackVoiceWaveform("same", 8))
    }
}
