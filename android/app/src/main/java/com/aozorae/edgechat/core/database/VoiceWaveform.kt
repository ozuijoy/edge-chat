package com.aozorae.edgechat.core.database

fun encodeVoiceWaveform(samples: List<Int>): String = samples
    .take(64)
    .joinToString(",") { it.coerceIn(0, 100).toString() }

fun decodeVoiceWaveform(value: String): List<Int> = value
    .split(',')
    .mapNotNull(String::toIntOrNull)
    .map { it.coerceIn(0, 100) }
