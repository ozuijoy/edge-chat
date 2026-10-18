package com.aozorae.edgechat.feature.chat

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.semantics.SemanticsProperties
import com.aozorae.edgechat.ui.theme.EdgeChatTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class MessageComposerTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun sendEnablesForTextAndClearsAfterSending() {
        var sent = ""
        compose.setContent {
            EdgeChatTheme {
                MessageComposer(
                    roomKey = "public:1",
                    roomTitle = "general",
                    attachment = null,
                    language = "en-US",
                    members = emptyList(),
                    currentUserId = 1,
                    onChooseAttachment = {},
                    onClearAttachment = {},
                    onSend = { content, _ -> sent = content },
                )
            }
        }

		compose.onAllNodesWithTag("send_message").assertCountEquals(0)
		compose.onNodeWithTag("record_voice").fetchSemanticsNode()
        compose.onNodeWithTag("message_input").performTextInput("Hello")
        compose.onNodeWithTag("send_message").assertIsEnabled().performClick()
        val editableText = compose
            .onNodeWithTag("message_input")
            .fetchSemanticsNode()
            .config[SemanticsProperties.EditableText]
            .text
        assertEquals("", editableText)
        assertEquals("Hello", sent)
    }

    @Test
    fun inputGrowsForMultipleLines() {
        compose.setContent {
            EdgeChatTheme {
                MessageComposer(
                    roomKey = "public:1",
                    roomTitle = "general",
                    attachment = null,
                    language = "en-US",
                    members = emptyList(),
                    currentUserId = 1,
                    onChooseAttachment = {},
                    onClearAttachment = {},
                    onSend = { _, _ -> },
                )
            }
        }

        val input = compose.onNodeWithTag("message_input")
        val initialHeight = input.fetchSemanticsNode().boundsInRoot.height
        input.performTextInput("One\nTwo\nThree\nFour")
        compose.waitForIdle()

        assertTrue(input.fetchSemanticsNode().boundsInRoot.height > initialHeight)
    }
}
