package com.aozorae.edgechat.ui

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

private val databaseTimestamp = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")

fun formatMessageTime(value: String, language: String): String = parseTimestamp(value)
    .atZone(ZoneId.systemDefault())
    .format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale(language)))

fun formatConversationTime(value: String?, language: String): String {
    if (value.isNullOrBlank()) return ""
    val time = parseTimestamp(value).atZone(ZoneId.systemDefault())
    val today = LocalDate.now(ZoneId.systemDefault())
    return when (time.toLocalDate()) {
        today -> time.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale(language)))
        today.minusDays(1) -> if (language == "zh-CN") "昨天" else "Yesterday"
        else -> time.format(DateTimeFormatter.ofPattern(if (language == "zh-CN") "M/d" else "MMM d", locale(language)))
    }
}

fun formatDayLabel(value: String, language: String): String {
    val date = parseTimestamp(value).atZone(ZoneId.systemDefault()).toLocalDate()
    val today = LocalDate.now(ZoneId.systemDefault())
    return when (date) {
        today -> if (language == "zh-CN") "今天" else "Today"
        today.minusDays(1) -> if (language == "zh-CN") "昨天" else "Yesterday"
        else -> date.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale(language)))
    }
}

fun messageDate(value: String): LocalDate = parseTimestamp(value).atZone(ZoneId.systemDefault()).toLocalDate()

private fun parseTimestamp(value: String): Instant = runCatching { Instant.parse(value) }
    .recoverCatching { OffsetDateTime.parse(value).toInstant() }
    .getOrElse { LocalDateTime.parse(value, databaseTimestamp).atZone(ZoneId.of("UTC")).toInstant() }

private fun locale(language: String): Locale = if (language == "zh-CN") Locale.SIMPLIFIED_CHINESE else Locale.ENGLISH
