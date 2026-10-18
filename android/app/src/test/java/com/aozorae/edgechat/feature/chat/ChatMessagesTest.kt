package com.aozorae.edgechat.feature.chat

import com.aozorae.edgechat.core.database.MessageEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatMessagesTest {
    @Test
    fun onlyImageMimeTypesUseInlinePreview() {
        assertTrue(isImageAttachment("image/jpeg"))
        assertFalse(isImageAttachment("video/mp4"))
        assertFalse(isImageAttachment("application/pdf"))
        assertFalse(isImageAttachment(null))
    }

    @Test
    fun imagePreviewKeepsPortraitAndLandscapeAspectRatiosWithinBounds() {
        val portrait = fitImagePreview(aspectRatio = 9f / 19.5f, maxWidth = 280f, maxHeight = 240f)
        assertEquals(240f, portrait.height, 0.01f)
        assertEquals(110.77f, portrait.width, 0.01f)

        val landscape = fitImagePreview(aspectRatio = 19.5f / 9f, maxWidth = 280f, maxHeight = 240f)
        assertEquals(280f, landscape.width, 0.01f)
        assertEquals(129.23f, landscape.height, 0.01f)
    }

    @Test
    fun authorGroupRestartsForAnotherSender() {
        assertTrue(startsMessageGroup(message(2, "2026-08-30T10:01:00Z", "2"), message(1, "2026-08-30T10:00:00Z", "1")))
    }

    @Test
    fun authorGroupRestartsAcrossDates() {
        assertTrue(startsMessageGroup(message(2, "2026-08-31T10:01:00Z"), message(1, "2026-08-30T10:00:00Z")))
    }

    @Test
    fun adjacentMessagesFromSameSenderStayGrouped() {
        assertFalse(startsMessageGroup(message(2, "2026-08-30T10:01:00Z"), message(1, "2026-08-30T10:00:00Z")))
    }

    private fun message(id: Long, createdAt: String, senderId: String = "1") = MessageEntity(
        id = id,
        roomKind = "public",
        roomId = 1,
        clientMessageId = null,
        content = "message",
        createdAt = createdAt,
        source = "edgechat",
        senderKind = "local",
        senderId = senderId,
        senderUsername = "user$senderId",
        senderDisplayName = "User $senderId",
        senderAvatarUrl = "",
        attachmentKey = null,
        attachmentName = null,
        attachmentType = null,
        attachmentSize = null,
        attachmentUrl = null,
    )
}
