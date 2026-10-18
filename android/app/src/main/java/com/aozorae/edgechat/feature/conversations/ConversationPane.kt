package com.aozorae.edgechat.feature.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Badge
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aozorae.edgechat.core.database.ConversationEntity
import com.aozorae.edgechat.core.database.UserEntity
import com.aozorae.edgechat.core.network.dto.SessionDto
import com.aozorae.edgechat.core.repository.RoomIdentity
import com.aozorae.edgechat.ui.components.EdgeAvatar
import com.aozorae.edgechat.ui.components.resolveServerUrl
import com.aozorae.edgechat.ui.formatConversationTime
import com.aozorae.edgechat.ui.theme.LocalEdgeChatColors

@Composable
fun ConversationPane(
    siteName: String,
    serverBaseUrl: String,
    currentUser: SessionDto,
    conversations: List<ConversationEntity>,
    users: List<UserEntity>,
    selected: RoomIdentity?,
    language: String,
    onSelect: (RoomIdentity) -> Unit,
    onJoin: (Long) -> Unit,
    onOpenDm: (Long) -> Unit,
    onCreateGroup: (String, String, String, List<Long>) -> Unit,
    onSettings: () -> Unit,
) {
    var showNew by remember { mutableStateOf(false) }
    val colors = LocalEdgeChatColors.current

    Surface(color = colors.canvas) {
        Box(Modifier.fillMaxHeight()) {
            Column(Modifier.fillMaxSize()) {
                ConversationHeader(
                    siteName = siteName,
                    currentUser = currentUser,
                    serverBaseUrl = serverBaseUrl,
                    language = language,
                    onSettings = onSettings,
                )
                HorizontalDivider(color = colors.separator)
                if (conversations.isEmpty()) {
                    EmptyConversationList(language, Modifier.weight(1f))
                } else {
                    LazyColumn(
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(bottom = 96.dp),
                    ) {
                        items(conversations, key = { "${it.kind}:${it.id}" }) { item ->
                            ConversationRow(
                                item = item,
                                selected = selected?.kind == item.kind && selected.id == item.id,
                                serverBaseUrl = serverBaseUrl,
                                language = language,
                                onClick = {
                                    if (item.isMember) onSelect(RoomIdentity(item.kind, item.id)) else onJoin(item.id)
                                },
                            )
                            HorizontalDivider(
                                modifier = Modifier.padding(start = 84.dp),
                                color = colors.separator,
                            )
                        }
                    }
                }
            }
            FloatingActionButton(
                onClick = { showNew = true },
                modifier = Modifier.align(Alignment.BottomEnd).padding(20.dp).size(56.dp),
                shape = MaterialTheme.shapes.extraLarge,
                containerColor = colors.accent,
                contentColor = colors.onAccent,
            ) {
                Icon(Icons.Outlined.Add, contentDescription = if (language == "zh-CN") "新建会话" else "New conversation")
            }
        }
    }

    if (showNew) {
        NewConversationDialog(
            users = users,
            language = language,
            onDismiss = { showNew = false },
            onOpenDm = { showNew = false; onOpenDm(it) },
            onCreateGroup = { name, description, kind, ids ->
                showNew = false
                onCreateGroup(name, description, kind, ids)
            },
        )
    }
}

@Composable
private fun ConversationHeader(
    siteName: String,
    currentUser: SessionDto,
    serverBaseUrl: String,
    language: String,
    onSettings: () -> Unit,
) {
    val colors = LocalEdgeChatColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(colors.topBarGradient))
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(androidx.compose.foundation.shape.CircleShape)
                .clickable(role = Role.Button, onClick = onSettings)
                .semantics {
                    role = Role.Button
                    contentDescription = if (language == "zh-CN") "设置" else "Settings"
                },
        ) {
            EdgeAvatar(
                imageUrl = resolveServerUrl(serverBaseUrl, currentUser.avatarUrl),
                displayName = currentUser.displayName,
                modifier = Modifier.fillMaxSize(),
            )
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(
                text = if (language == "zh-CN") "聊天" else "Chats",
                style = MaterialTheme.typography.headlineSmall,
                color = colors.textPrimary,
                maxLines = 1,
            )
            Text(
                text = siteName,
                style = MaterialTheme.typography.bodySmall,
                color = colors.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun EmptyConversationList(language: String, modifier: Modifier = Modifier) {
    val colors = LocalEdgeChatColors.current
    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Surface(color = colors.subtleSecondary, shape = MaterialTheme.shapes.extraLarge) {
            Icon(
                Icons.Outlined.Forum,
                contentDescription = null,
                modifier = Modifier.padding(20.dp).size(36.dp),
                tint = colors.iconSecondary,
            )
        }
        Spacer(Modifier.size(20.dp))
        Text(
            text = if (language == "zh-CN") "还没有会话" else "No conversations yet",
            style = MaterialTheme.typography.titleMedium,
            color = colors.textPrimary,
        )
        Spacer(Modifier.size(8.dp))
        Text(
            text = if (language == "zh-CN") "新建会话或加入公开群组" else "Start a conversation or join a public group.",
            style = MaterialTheme.typography.bodyMedium,
            color = colors.textSecondary,
        )
    }
}

@Composable
private fun ConversationRow(
    item: ConversationEntity,
    selected: Boolean,
    serverBaseUrl: String,
    language: String,
    onClick: () -> Unit,
) {
    val colors = LocalEdgeChatColors.current
    val rowBackground = if (selected) colors.subtleSecondary else colors.canvas
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(rowBackground)
            .semantics { this.selected = selected }
            .clickable(role = Role.Button, onClick = onClick)
            .testTag("conversation:${item.kind}:${item.id}")
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EdgeAvatar(
            imageUrl = resolveServerUrl(serverBaseUrl, item.avatarUrl),
            displayName = item.title,
            modifier = Modifier.size(52.dp),
        )
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = item.title,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleSmall,
                    color = colors.textPrimary,
                    fontWeight = if (item.unreadCount > 0) FontWeight.SemiBold else FontWeight.Medium,
                )
                if (item.kind != "dm") {
                    Icon(
                        imageVector = if (item.kind == "private") Icons.Outlined.Lock else Icons.Outlined.Group,
                        contentDescription = if (item.kind == "private") {
                            if (language == "zh-CN") "私有群组" else "Private group"
                        } else if (language == "zh-CN") "公开群组" else "Public group",
                        modifier = Modifier.padding(start = 6.dp).size(15.dp),
                        tint = colors.iconSecondary,
                    )
                }
                val time = formatConversationTime(item.lastMessageAt, language)
                if (time.isNotBlank()) {
                    Spacer(Modifier.width(10.dp))
                    Text(text = time, style = MaterialTheme.typography.labelSmall, color = colors.textSecondary)
                }
            }
            Spacer(Modifier.size(3.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                val subtitle = if (!item.isMember) {
                    if (language == "zh-CN") "点按加入公开群组" else "Tap to join public group"
                } else {
                    item.subtitle.ifBlank {
                        "${item.memberCount} ${if (language == "zh-CN") "位成员" else "members"}"
                    }
                }
                Text(
                    text = subtitle,
                    modifier = Modifier.weight(1f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textSecondary,
                )
                if (item.mentionUnreadCount > 0) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = if (language == "zh-CN") "有人@我" else "Mentioned you",
                        style = MaterialTheme.typography.labelSmall,
                        color = colors.critical,
                        fontWeight = FontWeight.Bold,
                    )
                }
                if (item.unreadCount > 0) {
                    Spacer(Modifier.width(10.dp))
                    Badge(containerColor = colors.accent, contentColor = colors.onAccent) {
                        Text(if (item.unreadCount > 99) "99+" else item.unreadCount.toString())
                    }
                }
            }
        }
    }
}
