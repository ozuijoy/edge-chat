package com.aozorae.edgechat.core.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ServerStoreTest {
    @Test
    fun normalizesHttpsOrigin() {
        assertEquals("https://chat.example.com/", ServerStore.normalize("chat.example.com/"))
        assertEquals("https://chat.example.com:8443/", ServerStore.normalize("https://chat.example.com:8443"))
    }

    @Test
    fun rejectsPathsAndInsecureProductionHosts() {
        assertThrows(IllegalArgumentException::class.java) {
            ServerStore.normalize("https://chat.example.com/app")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ServerStore.normalize("http://chat.example.com")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ServerStore.normalize("https://user@chat.example.com")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ServerStore.normalize("https://chat.example.com?server=other")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ServerStore.normalize("https://chat.example.com#settings")
        }
    }
}
