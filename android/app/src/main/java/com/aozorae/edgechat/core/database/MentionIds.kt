package com.aozorae.edgechat.core.database

fun encodeMentionUserIds(userIds: List<Long>): String =
    userIds.distinct().joinToString(",")

fun decodeMentionUserIds(value: String): List<Long> =
    value.split(',').mapNotNull(String::toLongOrNull)
