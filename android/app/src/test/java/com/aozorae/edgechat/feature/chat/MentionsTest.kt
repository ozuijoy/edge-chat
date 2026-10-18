package com.aozorae.edgechat.feature.chat

import com.aozorae.edgechat.core.network.dto.MemberDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MentionsTest {
    private val members = listOf(
        MemberDto(1, "admin", "Admin", role = "owner"),
        MemberDto(2, "alice", "Alice", role = "member"),
    )

    @Test
    fun activeQueryAndMentionIdsFollowVisibleText() {
        assertEquals(ActiveMentionQuery(6, 9, "al"), findActiveMentionQuery("hello @al", 9))
        assertEquals(ActiveMentionQuery(6, 9, "al"), findActiveMentionQuery("hello,@al", 9))
        assertNull(findActiveMentionQuery("mail@al", 7))
        assertEquals(listOf(2L), resolveMentionUserIds("@alice hello", members, 1))
        assertEquals(emptyList<Long>(), resolveMentionUserIds("@alice2", members, 1))
    }

    @Test
    fun rangesOnlyIncludeServerConfirmedMentionIds() {
        assertEquals(
            listOf(MentionRange(3, 9, 2)),
            findMentionRanges("Hi @alice and @admin", members, listOf(2)),
        )
    }
}
