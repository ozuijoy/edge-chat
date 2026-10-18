package com.aozorae.edgechat.core.diagnostics

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DiagnosticLog @Inject constructor(@ApplicationContext private val context: Context) {
    private val entries = ArrayDeque<String>()

    @Synchronized
    fun record(event: String) {
        val safe = event.replace(Regex("(?i)(token|password|content)=\\S+"), "$1=[redacted]")
        entries.addLast("${Instant.now()} $safe")
        while (entries.size > 300) entries.removeFirst()
    }

    @Synchronized
    fun export(): File {
        val directory = File(context.cacheDir, "diagnostics").apply { mkdirs() }
        return File(directory, "edgechat-diagnostics.txt").apply {
            writeText(entries.joinToString("\n"))
        }
    }
}
