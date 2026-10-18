package com.aozorae.edgechat.feature.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class WelcomeScreenTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun loginStartsDisabledUntilAllFieldsAreFilled() {
        compose.setContent {
            WelcomeScreen(null, false, "en-US") { _, _, _ -> }
        }

        compose.onNodeWithTag("serverField").assertIsDisplayed()
        compose.onNodeWithTag("usernameField").assertIsDisplayed()
        compose.onNodeWithTag("passwordField").assertIsDisplayed()
        compose.onNodeWithTag("loginButton").assertIsNotEnabled()
    }

    @Test
    fun loginSubmitsServerAndCredentials() {
        var submitted: Triple<String, String, String>? = null
        compose.setContent {
            WelcomeScreen(null, false, "en-US") { server, username, password ->
                submitted = Triple(server, username, password)
            }
        }

        compose.onNodeWithTag("serverField").performTextInput("https://chat.example.com")
        compose.onNodeWithTag("usernameField").performTextInput("alice")
        compose.onNodeWithTag("passwordField").performTextInput("secret")
        compose.onNodeWithTag("loginButton").performClick()

        assertEquals(Triple("https://chat.example.com", "alice", "secret"), submitted)
    }

    @Test
    fun serverAndUsernameSurviveStateRestoration() {
        val restoration = StateRestorationTester(compose)
        restoration.setContent {
            WelcomeScreen("https://old.example.com", false, "en-US") { _, _, _ -> }
        }

        compose.onNodeWithTag("serverField").performTextReplacement("https://chat.example.com")
        compose.onNodeWithTag("usernameField").performTextInput("alice")
        restoration.emulateSavedInstanceStateRestore()

        compose.onNodeWithTag("serverField").assertTextContains("https://chat.example.com")
        compose.onNodeWithTag("usernameField").assertTextContains("alice")
    }
}
