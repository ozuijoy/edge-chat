package com.aozorae.edgechat.core.session

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

data class StoredTokens(
    val accessToken: String,
    val refreshToken: String,
    val accessExpiresAt: String,
    val refreshExpiresAt: String,
)

@Singleton
class TokenVault @Inject constructor(private val dataStore: DataStore<Preferences>) {
    private val accessKey = stringPreferencesKey("access_token_encrypted")
    private val refreshKey = stringPreferencesKey("refresh_token_encrypted")
    private val accessExpiryKey = stringPreferencesKey("access_token_expires_at")
    private val refreshExpiryKey = stringPreferencesKey("refresh_token_expires_at")

    val hasSession: Flow<Boolean> = dataStore.data.map {
        it[accessKey] != null && it[refreshKey] != null
    }

    suspend fun read(): StoredTokens? {
        val values = dataStore.data.first()
        val access = values[accessKey]?.let(::decrypt) ?: return null
        val refresh = values[refreshKey]?.let(::decrypt) ?: return null
        return StoredTokens(
            access,
            refresh,
            values[accessExpiryKey].orEmpty(),
            values[refreshExpiryKey].orEmpty(),
        )
    }

    suspend fun accessToken(): String? = read()?.accessToken

    suspend fun save(tokens: StoredTokens) {
        val access = encrypt(tokens.accessToken)
        val refresh = encrypt(tokens.refreshToken)
        dataStore.edit {
            it[accessKey] = access
            it[refreshKey] = refresh
            it[accessExpiryKey] = tokens.accessExpiresAt
            it[refreshExpiryKey] = tokens.refreshExpiresAt
        }
    }

    suspend fun clear() {
        dataStore.edit {
            it.remove(accessKey)
            it.remove(refreshKey)
            it.remove(accessExpiryKey)
            it.remove(refreshExpiryKey)
        }
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return generator.generateKey()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val encrypted = Base64.encodeToString(cipher.doFinal(value.toByteArray()), Base64.NO_WRAP)
        return "$iv.$encrypted"
    }

    private fun decrypt(value: String): String? = runCatching {
        val (iv, encrypted) = value.split('.', limit = 2)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            key(),
            GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)),
        )
        String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)))
    }.getOrNull()

    private companion object {
        const val KEY_ALIAS = "edgechat-mobile-session-v1"
    }
}
