package com.aozorae.edgechat.feature.chat

import com.aozorae.edgechat.core.network.dto.MemberDto

data class ActiveMentionQuery(val start: Int, val end: Int, val query: String)

data class MentionRange(val start: Int, val end: Int, val userId: Long)

private fun isMentionBoundary(character: Char?): Boolean =
    character == null || character.isWhitespace() || character in "()[]{}<>\"'，。！？、：；,.!?"

private fun mentionsUsername(content: String, username: String): Boolean {
    val token = "@$username"
    var offset = content.indexOf(token)
    while (offset >= 0) {
        val before = content.getOrNull(offset - 1)
        val after = content.getOrNull(offset + token.length)
        if (isMentionBoundary(before) && isMentionBoundary(after)) return true
        offset = content.indexOf(token, offset + token.length)
    }
    return false
}

fun resolveMentionUserIds(content: String, members: List<MemberDto>, currentUserId: Long): List<Long> =
    members.filter { it.id != currentUserId && mentionsUsername(content, it.username) }.map { it.id }

fun findActiveMentionQuery(content: String, cursor: Int): ActiveMentionQuery? {
    if (cursor !in 0..content.length) return null
    val prefix = content.substring(0, cursor)
    val at = prefix.lastIndexOf('@')
    if (at < 0) return null
    val before = prefix.getOrNull(at - 1)
    if (!isMentionBoundary(before)) return null
    val query = prefix.substring(at + 1)
    if (query.any { it.isWhitespace() || it == '@' }) return null
    return ActiveMentionQuery(at, cursor, query)
}

fun findMentionRanges(content: String, members: List<MemberDto>, mentionUserIds: List<Long>): List<MentionRange> =
    members
        .filter { it.id in mentionUserIds }
        .flatMap { member ->
            val token = "@${member.username}"
            buildList {
                var offset = content.indexOf(token)
                while (offset >= 0) {
                    val before = content.getOrNull(offset - 1)
                    val after = content.getOrNull(offset + token.length)
                    if (isMentionBoundary(before) && isMentionBoundary(after)) {
                        add(MentionRange(offset, offset + token.length, member.id))
                    }
                    offset = content.indexOf(token, offset + token.length)
                }
            }
        }
        .sortedBy { it.start }
