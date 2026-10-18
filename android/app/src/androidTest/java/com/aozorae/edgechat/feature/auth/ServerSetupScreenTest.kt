package com.aozorae.edgechat.feature.auth

import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextInput
import org.junit.Rule
import org.junit.Test

class ServerSetupScreenTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun continueButtonStartsDisabled() {
        compose.setContent {
            ServerSetupScreen(false, null, "en-US", {})
        }
        compose.onNodeWithText("Server address").assertIsDisplayed()
        compose.onNodeWithText("Verify and continue").assertIsNotEnabled()
    }

    @Test
    fun serverAddressSurvivesStateRestoration() {
        val restoration = StateRestorationTester(compose)
        restoration.setContent {
            ServerSetupScreen(false, null, "en-US", {})
        }

        compose.onNode(hasSetTextAction()).performTextInput("https://chat.example.com")
        restoration.emulateSavedInstanceStateRestore()

        compose.onNode(hasSetTextAction()).assertTextContains("https://chat.example.com")
    }
}
