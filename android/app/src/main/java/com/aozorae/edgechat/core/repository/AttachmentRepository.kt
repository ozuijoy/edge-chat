package com.aozorae.edgechat.core.repository

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import com.aozorae.edgechat.core.session.ServerStore
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

data class PendingAttachment(
    val path: String,
    val name: String,
    val type: String,
    val size: Long,
    val kind: String? = null,
    val durationMs: Long? = null,
    val waveform: List<Int> = emptyList(),
)

@Singleton
class AttachmentRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val client: OkHttpClient,
    private val serverStore: ServerStore,
) {
    suspend fun import(uri: Uri): PendingAttachment = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        val name = resolver.displayName(uri) ?: "attachment"
        val type = resolver.getType(uri) ?: "application/octet-stream"
        val directory = File(context.filesDir, "pending").apply { mkdirs() }
        val target = File(directory, UUID.randomUUID().toString())
        resolver.openInputStream(uri).use { input ->
            requireNotNull(input) { "无法读取所选文件" }
            target.outputStream().use(input::copyTo)
        }
        PendingAttachment(target.absolutePath, name, type, target.length())
    }

    suspend fun download(relativeUrl: String, filename: String): Uri = withContext(Dispatchers.IO) {
        val base = requireNotNull(serverStore.baseUrl())
        val url = if (relativeUrl.startsWith("http")) relativeUrl else "$base${relativeUrl.trimStart('/')}"
        val directory = File(context.cacheDir, "downloads").apply { mkdirs() }
        val safeName = filename.replace(Regex("[\\\\/:*?\"<>|]"), "_")
        val target = File(directory, safeName)
        client.newCall(Request.Builder().url(url).build()).execute().use { response ->
            if (!response.isSuccessful) error("附件下载失败")
            response.body?.byteStream()?.use { input -> target.outputStream().use(input::copyTo) }
        }
        FileProvider.getUriForFile(context, "${context.packageName}.files", target)
    }

    suspend fun clearPrivateFiles() = withContext(Dispatchers.IO) {
        File(context.filesDir, "pending").deleteRecursively()
        File(context.cacheDir, "downloads").deleteRecursively()
        File(context.cacheDir, "diagnostics").deleteRecursively()
    }

    private fun ContentResolver.displayName(uri: Uri): String? =
        query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
}
