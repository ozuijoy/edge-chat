package com.aozorae.edgechat.core.session

import android.os.Build
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.aozorae.edgechat.BuildConfig
import java.net.URI
import java.util.Locale
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

data class ServerProfile(val baseUrl: String, val siteName: String, val siteIconUrl: String)

@Singleton
class ServerStore @Inject constructor(private val dataStore: DataStore<Preferences>) {
    private val baseUrlKey = stringPreferencesKey("server_base_url")
    private val siteNameKey = stringPreferencesKey("server_site_name")
    private val siteIconKey = stringPreferencesKey("server_site_icon")
    private val installationKey = stringPreferencesKey("installation_id")
    private val languageKey = stringPreferencesKey("language")

    val server: Flow<ServerProfile?> = dataStore.data.map { values ->
        values[baseUrlKey]?.let {
            ServerProfile(it, values[siteNameKey] ?: "EdgeChat", values[siteIconKey] ?: "")
        }
    }

    val language: Flow<String> = dataStore.data.map { it[languageKey] ?: defaultLanguage() }

    suspend fun saveServer(profile: ServerProfile) {
        dataStore.edit {
            it[baseUrlKey] = profile.baseUrl
            it[siteNameKey] = profile.siteName
            it[siteIconKey] = profile.siteIconUrl
        }
    }

    suspend fun clearServer() {
        dataStore.edit {
            it.remove(baseUrlKey)
            it.remove(siteNameKey)
            it.remove(siteIconKey)
        }
    }

    suspend fun baseUrl(): String? = server.first()?.baseUrl

    suspend fun installationId(): String {
        val existing = dataStore.data.first()[installationKey]
        if (existing != null) return existing
        val created = UUID.randomUUID().toString()
        dataStore.edit { it[installationKey] = created }
        return created
    }

    suspend fun setLanguage(language: String) {
        dataStore.edit { it[languageKey] = language }
    }

    fun deviceName(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim()

    companion object {
        fun normalize(raw: String): String {
            val candidate = raw.trim().trimEnd('/')
            val withScheme = if (candidate.contains("://")) candidate else "https://$candidate"
            val uri = URI(withScheme)
            val host = uri.host ?: throw IllegalArgumentException("服务器地址无效")
            if (uri.userInfo != null || uri.query != null || uri.fragment != null) {
                throw IllegalArgumentException("服务器地址不能包含账号、查询参数或片段")
            }
            val scheme = uri.scheme?.lowercase(Locale.ROOT)
            val debugHttp = BuildConfig.DEBUG && scheme == "http" &&
                (host == "localhost" || host == "10.0.2.2" || host == "127.0.0.1")
            if (scheme != "https" && !debugHttp) {
                throw IllegalArgumentException("正式客户端只连接 HTTPS 服务器")
            }
            if (!uri.path.isNullOrBlank() && uri.path != "/") {
                throw IllegalArgumentException("请输入服务器根地址，不要包含路径")
            }
            val port = if (uri.port > 0) ":${uri.port}" else ""
            return "$scheme://$host$port/"
        }

        private fun defaultLanguage(): String =
            if (Locale.getDefault().language.startsWith("zh")) "zh-CN" else "en-US"
    }
}
