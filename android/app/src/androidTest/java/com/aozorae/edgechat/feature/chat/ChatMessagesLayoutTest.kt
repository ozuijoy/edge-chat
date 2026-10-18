package com.aozorae.edgechat.feature.chat

import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import com.aozorae.edgechat.core.database.MessageEntity
import com.aozorae.edgechat.core.database.OutboxEntity
import com.aozorae.edgechat.core.network.dto.SessionDto
import com.aozorae.edgechat.ui.theme.EdgeChatTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.io.File

class ChatMessagesLayoutTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun ownAndIncomingMessagesUseOppositeSides() {
        compose.setContent {
            EdgeChatTheme {
                Box(Modifier.width(360.dp).height(640.dp)) {
                    ChatMessages(
                        messages = listOf(
                            message(id = 1, senderId = "2", content = "Incoming"),
                            message(id = 2, senderId = "1", content = "Mine"),
                        ),
                        outbox = listOf(pendingMessage()),
                        currentUser = currentUser(),
                        serverBaseUrl = "https://example.com",
                        language = "en-US",
                        scrollState = rememberLazyListState(),
                        onLoadOlder = {},
                        onRetry = {},
                        onCancel = {},
                        onDeleteMessage = {},
                        onOpenAttachment = { _, _, _ -> },
                    )
                }
            }
        }

        val listCenter = compose.onNodeWithTag("message_list").fetchSemanticsNode().boundsInRoot.center.x
        val incomingCenter = compose.onNodeWithTag("message_bubble:1").fetchSemanticsNode().boundsInRoot.center.x
        val ownCenter = compose.onNodeWithTag("message_bubble:2").fetchSemanticsNode().boundsInRoot.center.x
        val pendingCenter = compose
            .onNodeWithTag("pending_message_bubble:pending-1")
            .fetchSemanticsNode()
            .boundsInRoot
            .center
            .x

        assertTrue(incomingCenter < listCenter)
        assertTrue(ownCenter > listCenter)
        assertTrue(pendingCenter > listCenter)
    }

    @Test
	fun imageAttachmentsUseInlinePreviewAndRemainOpenable() {
        var opened: Triple<String, String, String>? = null
        compose.setContent {
            EdgeChatTheme {
                Box(Modifier.width(360.dp).height(640.dp)) {
                    ChatMessages(
                        messages = listOf(
                            message(
                                id = 3,
                                senderId = "2",
                                content = "",
                                attachmentName = "photo.jpg",
                                attachmentType = "image/jpeg",
                                attachmentUrl = "https://images.invalid/photo.jpg",
                            ),
                            message(
                                id = 4,
                                senderId = "2",
                                content = "",
                                attachmentName = "report.pdf",
                                attachmentType = "application/pdf",
                                attachmentUrl = "/files/report.pdf",
                            ),
                        ),
                        outbox = emptyList(),
                        currentUser = currentUser(),
                        serverBaseUrl = "https://example.com",
                        language = "en-US",
                        scrollState = rememberLazyListState(),
                        onLoadOlder = {},
                        onRetry = {},
                        onCancel = {},
                        onDeleteMessage = {},
                        onOpenAttachment = { url, name, type -> opened = Triple(url, name, type) },
                    )
	}

	@Test
	fun voiceAttachmentsUseInlineWaveformPlayer() {
		compose.setContent {
			EdgeChatTheme {
				Box(Modifier.width(360.dp).height(640.dp)) {
					ChatMessages(
						messages = listOf(
							message(
								id = 5,
								senderId = "2",
								content = "",
								attachmentName = "voice.m4a",
								attachmentType = "audio/mp4",
								attachmentUrl = "/files/voice.m4a",
								attachmentKind = "voice",
								attachmentDurationMs = 8_200,
								attachmentWaveform = "12,44,90",
							),
						),
						outbox = emptyList(),
						currentUser = currentUser(),
						serverBaseUrl = "https://example.com",
						language = "en-US",
						scrollState = rememberLazyListState(),
						onLoadOlder = {},
						onRetry = {},
						onCancel = {},
						onDeleteMessage = {},
						onOpenAttachment = { _, _, _ -> },
					)
				}
			}
		}

		compose.onNodeWithTag("message_voice:5").fetchSemanticsNode()
		compose.onNodeWithTag("voice_play:message:5").fetchSemanticsNode()
	}
            }
        }

        compose.onNodeWithTag("message_image:3").performClick()
        compose.onNodeWithTag("message_attachment:4").assertExists()
        assertEquals(
            Triple("https://images.invalid/photo.jpg", "photo.jpg", "image/jpeg"),
            opened,
        )
    }

    @Test
    fun portraitPendingImageUsesItsOwnAspectRatioAndStaysCompact() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val portrait = File(context.cacheDir, "portrait-preview.png")
        Bitmap.createBitmap(90, 180, Bitmap.Config.ARGB_8888).run {
            eraseColor(Color.RED)
            portrait.outputStream().use { compress(Bitmap.CompressFormat.PNG, 100, it) }
            recycle()
        }
        compose.setContent {
            EdgeChatTheme {
                Box(Modifier.width(360.dp).height(640.dp)) {
                    ChatMessages(
                        messages = emptyList(),
                        outbox = listOf(
                            pendingMessage(
                                localAttachmentPath = portrait.absolutePath,
                                attachmentName = "portrait-preview.png",
                                attachmentType = "image/png",
                            ),
                        ),
                        currentUser = currentUser(),
                        serverBaseUrl = "https://example.com",
                        language = "en-US",
                        scrollState = rememberLazyListState(),
                        onLoadOlder = {},
                        onRetry = {},
                        onCancel = {},
                        onDeleteMessage = {},
                        onOpenAttachment = { _, _, _ -> },
                    )
                }
            }
        }

        compose.waitUntil(5_000) {
            val bounds = compose.onNodeWithTag("pending_message_image:pending-1")
                .fetchSemanticsNode().boundsInRoot
            bounds.height > bounds.width
        }
        val bounds = compose.onNodeWithTag("pending_message_image:pending-1")
            .fetchSemanticsNode().boundsInRoot
        assertTrue(bounds.height > bounds.width * 1.9f)
        assertTrue(bounds.height <= 240f * context.resources.displayMetrics.density + 1f)
        portrait.delete()
    }

    private fun currentUser() = SessionDto(
        userId = 1,
        username = "me",
        displayName = "Me",
    )

    private fun message(
        id: Long,
        senderId: String,
        content: String,
        attachmentName: String? = null,
        attachmentType: String? = null,
		attachmentUrl: String? = null,
		attachmentKind: String? = null,
		attachmentDurationMs: Long? = null,
		attachmentWaveform: String = "",
    ) = MessageEntity(
        id = id,
        roomKind = "public",
        roomId = 1,
        clientMessageId = null,
        content = content,
        createdAt = "2026-08-30T10:0${id}:00Z",
        source = "edgechat",
        senderKind = "local",
        senderId = senderId,
        senderUsername = "user$senderId",
        senderDisplayName = "User $senderId",
        senderAvatarUrl = "",
        attachmentKey = null,
        attachmentName = attachmentName,
        attachmentType = attachmentType,
        attachmentSize = null,
		attachmentUrl = attachmentUrl,
		attachmentKind = attachmentKind,
		attachmentDurationMs = attachmentDurationMs,
		attachmentWaveform = attachmentWaveform,
    )

    private fun pendingMessage(
        localAttachmentPath: String? = null,
        attachmentName: String? = null,
        attachmentType: String? = null,
    ) = OutboxEntity(
        clientMessageId = "pending-1",
        roomKind = "public",
        roomId = 1,
        content = "Pending",
        localAttachmentPath = localAttachmentPath,
        attachmentName = attachmentName,
        attachmentType = attachmentType,
        attachmentSize = null,
        clientUploadId = null,
        uploadedKey = null,
        uploadedUrl = null,
        state = "SENDING",
        failure = null,
        attempts = 0,
        createdAt = 0,
    )
}
