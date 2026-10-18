package com.aozorae.edgechat.ui

import com.aozorae.edgechat.ui.components.resolveServerUrl
import org.junit.Assert.assertEquals
import org.junit.Test

class ChatTimeFormatterTest {
    @Test
    fun databaseAndIsoTimestampsRepresentTheSameDate() {
        assertEquals(
            messageDate("2026-08-30T10:15:00Z"),
            messageDate("2026-08-30 10:15:00"),
        )
    }

    @Test
    fun serverUrlsResolveRelativeMediaPaths() {
        assertEquals(
            "https://chat.example.com/files/avatar.png",
            resolveServerUrl("https://chat.example.com/", "/files/avatar.png"),
        )
        assertEquals(
            "https://cdn.example.com/avatar.png",
            resolveServerUrl("https://chat.example.com/", "https://cdn.example.com/avatar.png"),
        )
    }
}
