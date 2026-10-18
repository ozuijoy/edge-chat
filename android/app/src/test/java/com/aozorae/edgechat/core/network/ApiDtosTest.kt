package com.aozorae.edgechat.core.network

import com.aozorae.edgechat.core.network.dto.MessageDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class ApiDtosTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
	fun senderIdAcceptsLocalNumberAndExternalString() {
        val local = json.decodeFromString<MessageDto>(
            """{"id":1,"createdAt":"2026-08-30 12:00:00","sender":{"kind":"local","id":42,"displayName":"A"}}""",
        )
        val external = json.decodeFromString<MessageDto>(
            """{"id":2,"createdAt":"2026-08-30 12:00:01","sender":{"kind":"external","id":"telegram:7","displayName":"B"}}""",
        )
        assertEquals("42", local.sender.id)
        assertEquals("telegram:7", external.sender.id)
	}

	@Test
	fun voiceAttachmentKeepsDurationAndWaveform() {
		val message = json.decodeFromString<MessageDto>(
			"""{"id":3,"createdAt":"2026-09-02 12:00:00","sender":{"kind":"local","id":42,"displayName":"A"},"attachment":{"key":"42/voice.m4a","name":"voice.m4a","type":"audio/mp4","size":2048,"url":"/files/voice","kind":"voice","durationMs":8200,"waveform":[12,44,90]}}""",
		)
		assertEquals("voice", message.attachment?.kind)
		assertEquals(8_200L, message.attachment?.durationMs)
		assertEquals(listOf(12, 44, 90), message.attachment?.waveform)
	}
}
