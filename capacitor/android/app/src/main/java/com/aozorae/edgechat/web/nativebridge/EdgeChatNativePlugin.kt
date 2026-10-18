package com.aozorae.edgechat.web.nativebridge

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.aozorae.edgechat.web.MainActivity
import com.aozorae.edgechat.web.R
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

private const val NOTIFICATION_PERMISSION_ALIAS = "notifications"
private const val MICROPHONE_PERMISSION_ALIAS = "microphone"
private const val NOTIFICATION_CHANNEL_ID = "edgechat_messages"
private const val NOTIFICATION_ACTION = "com.aozorae.edgechat.web.OPEN_NOTIFICATION"
private const val EXTRA_ROOM_KIND = "roomKind"
private const val EXTRA_ROOM_ID = "roomId"
private const val MAX_FILE_BYTES = 20 * 1024 * 1024

@CapacitorPlugin(
    name = "EdgeChatNative",
    permissions = [
        Permission(
            alias = NOTIFICATION_PERMISSION_ALIAS,
            strings = [Manifest.permission.POST_NOTIFICATIONS],
        ),
        Permission(
            alias = MICROPHONE_PERMISSION_ALIAS,
            strings = [Manifest.permission.RECORD_AUDIO],
        ),
    ],
)
class EdgeChatNativePlugin : Plugin() {
    override fun load() {
        createNotificationChannel()
        emitNotificationTarget(activity.intent)
    }

    @PluginMethod
    fun pickFile(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = call.getString("accept", "*/*") ?: "*/*"
        }
        startActivityForResult(call, intent, "handlePickedFile")
    }

    @ActivityCallback
    private fun handlePickedFile(call: PluginCall, result: ActivityResult) {
        val uri = result.data?.data
        if (result.resultCode != android.app.Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("cancelled", true))
            return
        }

        val metadata = readFileMetadata(uri)
        if (metadata.size > MAX_FILE_BYTES) {
            call.reject("文件不能超过 20 MB")
            return
        }

        call.resolve(
            JSObject()
                .put("name", metadata.name)
                .put("type", context.contentResolver.getType(uri) ?: "application/octet-stream")
                .put("uri", uri.toString()),
        )
    }

    @PluginMethod
    fun requestMicrophonePermission(call: PluginCall) {
        // 先走应用权限，再让 WebView 获取音频流，网页才能明确区分拒绝授权与设备故障。
        if (getPermissionState(MICROPHONE_PERMISSION_ALIAS) == PermissionState.GRANTED) {
            microphonePermissionResult(call)
        } else {
            requestPermissionForAlias(MICROPHONE_PERMISSION_ALIAS, call, "microphonePermissionResult")
        }
    }

    @PermissionCallback
    private fun microphonePermissionResult(call: PluginCall) {
        call.resolve(JSObject().put("state", getPermissionState(MICROPHONE_PERMISSION_ALIAS).toString()))
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        // 用户选择“不再询问”后系统不再弹窗，提供直达本应用权限页的恢复入口。
        activity.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")),
        )
        call.resolve()
    }

    @PluginMethod
    fun checkNotificationPermission(call: PluginCall) {
        call.resolve(JSObject().put("state", notificationPermissionState()))
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(JSObject().put("state", "granted"))
            return
        }
        requestPermissionForAlias(
            NOTIFICATION_PERMISSION_ALIAS,
            call,
            "notificationPermissionResult",
        )
    }

    @PermissionCallback
    private fun notificationPermissionResult(call: PluginCall) {
        call.resolve(JSObject().put("state", notificationPermissionState()))
    }

    @PluginMethod
    @SuppressLint("MissingPermission")
    fun showNotification(call: PluginCall) {
        if (notificationPermissionState() != "granted") {
            call.resolve(JSObject().put("shown", false))
            return
        }

        val title = call.getString("title") ?: return call.reject("通知标题不能为空")
        val body = call.getString("body") ?: ""
        val tag = call.getString("tag", "edgechat") ?: "edgechat"
        val roomKind = call.getString("roomKind")
        val roomId = call.getInt("roomId")
        val launchIntent = Intent(context, MainActivity::class.java).apply {
            action = NOTIFICATION_ACTION
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_ROOM_KIND, roomKind)
            putExtra(EXTRA_ROOM_ID, roomId ?: 0)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            tag.hashCode(),
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_edgechat)
            .setColor(context.getColor(R.color.edgechat_notification))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        NotificationManagerCompat.from(context).notify(tag, tag.hashCode(), notification)
        call.resolve(JSObject().put("shown", true))
    }

    @PluginMethod
    fun openExternal(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("链接不能为空")
        val uri = Uri.parse(url)
        if (uri.scheme !in setOf("http", "https", "mailto", "tel")) {
            call.reject("不支持此链接类型")
            return
        }

        try {
            activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
            call.resolve()
        } catch (_: ActivityNotFoundException) {
            call.reject("没有可打开此链接的应用")
        }
    }

    override fun handleOnNewIntent(intent: Intent) {
        emitNotificationTarget(intent)
    }

    private fun notificationPermissionState(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return "granted"
        }
        return getPermissionState(NOTIFICATION_PERMISSION_ALIAS)?.toString() ?: "prompt"
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            context.getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.notification_channel_description)
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun emitNotificationTarget(intent: Intent?) {
        if (intent?.action != NOTIFICATION_ACTION) return

        val roomKind = intent.getStringExtra(EXTRA_ROOM_KIND) ?: return
        val roomId = intent.getIntExtra(EXTRA_ROOM_ID, 0)
        if (roomId <= 0) return

        // 保留事件直到网页监听器就绪，避免冷启动阶段丢失用户点击的会话目标。
        notifyListeners(
            "notificationOpened",
            JSObject().put("kind", roomKind).put("id", roomId),
            true,
        )
        intent.action = null
        intent.removeExtra(EXTRA_ROOM_KIND)
        intent.removeExtra(EXTRA_ROOM_ID)
    }

    private data class FileMetadata(val name: String, val size: Long)

    private fun readFileMetadata(uri: Uri): FileMetadata {
        var name = "attachment"
        var size = 0L
        val cursor: Cursor? = context.contentResolver.query(
            uri,
            arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
            null,
            null,
            null,
        )
        cursor?.use {
            if (it.moveToFirst()) {
                val nameIndex = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIndex = it.getColumnIndex(OpenableColumns.SIZE)
                if (nameIndex >= 0) name = it.getString(nameIndex) ?: name
                if (sizeIndex >= 0 && !it.isNull(sizeIndex)) size = it.getLong(sizeIndex)
            }
        }
        return FileMetadata(name, size)
    }
}
