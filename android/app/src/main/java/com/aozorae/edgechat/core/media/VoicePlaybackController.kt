package com.aozorae.edgechat.core.media

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.OkHttpClient

@androidx.annotation.OptIn(markerClass = [UnstableApi::class])
class VoicePlaybackController @Inject constructor(
    @ApplicationContext context: Context,
    client: OkHttpClient,
) {
    private val player = ExoPlayer.Builder(context)
        .setMediaSourceFactory(DefaultMediaSourceFactory(OkHttpDataSource.Factory(client)))
        .build()
    private val handler = Handler(Looper.getMainLooper())
    private val mutableState = MutableStateFlow(VoicePlaybackState())
    val state: StateFlow<VoicePlaybackState> = mutableState.asStateFlow()
    private var fallbackDurationMs = 0L
    private val progress = object : Runnable {
        override fun run() {
            publish()
            if (player.isPlaying) handler.postDelayed(this, 200)
        }
    }

    init {
        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                publish()
                handler.removeCallbacks(progress)
                if (isPlaying) handler.post(progress)
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) player.seekTo(0)
                publish()
            }

            override fun onPlayerError(error: PlaybackException) {
                mutableState.value = mutableState.value.copy(playing = false, failed = true)
            }
        })
    }

    fun toggle(playbackId: String, url: String, durationMs: Long) {
        if (mutableState.value.playbackId == playbackId) {
            if (player.isPlaying) player.pause() else player.play()
            return
        }
        fallbackDurationMs = durationMs
        mutableState.value = VoicePlaybackState(playbackId = playbackId, durationMs = durationMs)
        player.setMediaItem(MediaItem.fromUri(url))
        player.prepare()
        player.play()
    }

    fun seek(playbackId: String, fraction: Float) {
        if (mutableState.value.playbackId != playbackId) return
        val duration = durationMs()
        if (duration > 0) player.seekTo((duration * fraction.coerceIn(0f, 1f)).toLong())
        publish()
    }

    fun cycleSpeed(playbackId: String) {
        if (mutableState.value.playbackId != playbackId) return
        val next = when (mutableState.value.speed) {
            1f -> 1.5f
            1.5f -> 2f
            else -> 1f
        }
        player.playbackParameters = PlaybackParameters(next)
        publish()
    }

    fun close() {
        handler.removeCallbacksAndMessages(null)
        player.release()
        mutableState.value = VoicePlaybackState()
    }

    private fun durationMs(): Long = player.duration.takeIf { it > 0 } ?: fallbackDurationMs

    private fun publish() {
        val current = mutableState.value
        mutableState.value = current.copy(
            playing = player.isPlaying,
            positionMs = player.currentPosition.coerceAtLeast(0),
            durationMs = durationMs(),
            speed = player.playbackParameters.speed,
        )
    }
}
