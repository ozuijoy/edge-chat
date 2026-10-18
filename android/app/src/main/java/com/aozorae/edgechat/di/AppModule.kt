package com.aozorae.edgechat.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStoreFile
import androidx.room.Room
import com.aozorae.edgechat.core.database.EdgeChatDatabase
import com.aozorae.edgechat.core.database.MIGRATION_1_2
import com.aozorae.edgechat.core.database.MIGRATION_2_3
import com.aozorae.edgechat.core.network.AuthInterceptor
import com.aozorae.edgechat.core.network.EdgeChatApi
import com.aozorae.edgechat.core.network.ServerUrlInterceptor
import com.aozorae.edgechat.core.network.SessionAuthenticator
import com.aozorae.edgechat.core.network.ServerUrlInterceptor.Companion.PLACEHOLDER_HOST
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Singleton
    fun json(): Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    }

    @Provides
    @Singleton
    fun dataStore(@ApplicationContext context: Context): DataStore<Preferences> =
        PreferenceDataStoreFactory.create { context.preferencesDataStoreFile("edgechat.preferences_pb") }

    @Provides
    @Singleton
    fun database(@ApplicationContext context: Context): EdgeChatDatabase =
        Room.databaseBuilder(context, EdgeChatDatabase::class.java, "edgechat.db")
			.addMigrations(MIGRATION_1_2, MIGRATION_2_3)
            .build()

    @Provides
    @Singleton
    fun okHttp(
        serverUrlInterceptor: ServerUrlInterceptor,
        authInterceptor: AuthInterceptor,
        authenticator: SessionAuthenticator,
    ): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(serverUrlInterceptor)
        .addInterceptor(authInterceptor)
        .authenticator(authenticator)
        .build()

    @Provides
    @Singleton
    fun api(client: OkHttpClient, json: Json): EdgeChatApi = Retrofit.Builder()
        .baseUrl("https://$PLACEHOLDER_HOST/")
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(EdgeChatApi::class.java)
}
