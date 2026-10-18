package com.aozorae.edgechat.core.media

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import kotlin.math.sqrt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class VoiceRecorder @Inject constructor(@ApplicationContext private val context: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val mutableState = MutableStateFlow(VoiceRecordingState())
    val state: StateFlow<VoiceRecordingState> = mutableState.asStateFlow()
    private var recorder: MediaRecorder? = null
    private var output: File? = null
    private var startedAt = 0L
    private var samples = mutableListOf<Int>()
    private var samplingJob: Job? = null

    fun start() {
        if (recorder != null) return
        val directory = File(context.filesDir, "pending").apply { mkdirs() }
        val file = File(directory, "voice-${System.currentTimeMillis()}.m4a")
        val activeRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }
        try {
            activeRecorder.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioChannels(1)
                setAudioSamplingRate(24_000)
                setAudioEncodingBitRate(64_000)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
        } catch (error: Exception) {
            activeRecorder.release()
            file.delete()
            throw error
        }
        recorder = activeRecorder
        output = file
        samples = mutableListOf()
        startedAt = System.currentTimeMillis()
        mutableState.value = VoiceRecordingState(active = true)
        samplingJob = scope.launch {
            while (isActive && recorder === activeRecorder) {
                delay(100)
                val amplitude = activeRecorder.maxAmplitude.coerceAtLeast(0)
                val level = (sqrt(amplitude / 32767.0) * 100).toInt().coerceIn(6, 100)
                samples += level
                mutableState.value = VoiceRecordingState(
                    active = true,
                    elapsedMs = System.currentTimeMillis() - startedAt,
                    waveform = normalizeVoiceWaveform(samples.takeLast(80), 32),
                )
            }
        }
    }

    fun finish(): com.aozorae.edgechat.core.repository.PendingAttachment? {
        val file = output ?: return null
        val durationMs = System.currentTimeMillis() - startedAt
        val stopped = stopRecorder()
        if (!stopped || durationMs < 500 || !file.exists()) {
            file.delete()
            return null
        }
        return com.aozorae.edgechat.core.repository.PendingAttachment(
            path = file.absolutePath,
            name = file.name,
            type = "audio/mp4",
            size = file.length(),
            kind = "voice",
            durationMs = durationMs,
            waveform = normalizeVoiceWaveform(samples),
        )
    }

    fun cancel() {
        val file = output
        stopRecorder()
        file?.delete()
    }

    fun close() {
        if (recorder != null) cancel()
        scope.cancel()
    }

    private fun stopRecorder(): Boolean {
        val activeRecorder = recorder ?: return false
        samplingJob?.cancel()
        samplingJob = null
        val stopped = runCatching { activeRecorder.stop() }.isSuccess
        activeRecorder.reset()
        activeRecorder.release()
        recorder = null
        output = null
        mutableState.value = VoiceRecordingState()
        return stopped
    }
}
