package com.aozorae.edgechat.feature.chat

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScaffoldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.aozorae.edgechat.core.database.ConversationEntity
import com.aozorae.edgechat.core.database.MessageEntity
import com.aozorae.edgechat.core.database.OutboxEntity
import com.aozorae.edgechat.core.network.dto.SessionDto
import com.aozorae.edgechat.core.network.dto.MemberDto
import com.aozorae.edgechat.core.media.VoicePlaybackState
import com.aozorae.edgechat.core.media.VoiceRecordingState
import com.aozorae.edgechat.core.repository.PendingAttachment
import com.aozorae.edgechat.core.repository.RoomIdentity
import com.aozorae.edgechat.ui.components.EdgeAvatar
import com.aozorae.edgechat.ui.components.EdgeChatBrandMark
import com.aozorae.edgechat.ui.components.resolveServerUrl
import com.aozorae.edgechat.ui.theme.LocalEdgeChatColors
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatPane(
    room: RoomIdentity?,
    conversation: ConversationEntity?,
    messages: List<MessageEntity>,
	outbox: List<OutboxEntity>,
	attachment: PendingAttachment?,
	voiceRecording: VoiceRecordingState,
	voicePlayback: VoicePlaybackState,
	members: List<MemberDto>,
    currentUser: SessionDto,
    serverBaseUrl: String,
    busy: Boolean,
    language: String,
    openAttachmentEvents: SharedFlow<Pair<android.net.Uri, String>>,
    onBack: (() -> Unit)?,
    onLoadOlder: () -> Unit,
    onSend: (String, List<Long>) -> Unit,
    onChooseAttachment: (android.net.Uri) -> Unit,
	onClearAttachment: () -> Unit,
	onStartVoiceRecording: () -> Unit,
	onCancelVoiceRecording: () -> Unit,
	onSendVoiceRecording: () -> Unit,
	onToggleVoicePlayback: (String, String, Long) -> Unit,
	onSeekVoicePlayback: (String, Float) -> Unit,
	onCycleVoicePlaybackSpeed: (String) -> Unit,
    onRetry: (String) -> Unit,
    onCancel: (String) -> Unit,
    onDeleteMessage: (Long) -> Unit,
    onOpenAttachment: (String, String, String) -> Unit,
    onManageGroup: () -> Unit,
) {
    val context = LocalContext.current
    val colors = LocalEdgeChatColors.current
    LaunchedEffect(openAttachmentEvents) {
        openAttachmentEvents.collect { (uri, type) ->
            val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, type)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            context.startActivity(Intent.createChooser(intent, null))
        }
    }

    if (room == null || conversation == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                EdgeChatBrandMark(size = 72.dp)
                Spacer(Modifier.size(20.dp))
                Text(
                    text = if (language == "zh-CN") "选择一个会话" else "Choose a conversation",
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.textPrimary,
                )
                Spacer(Modifier.size(6.dp))
                Text(
                    text = if (language == "zh-CN") "从左侧列表开始聊天" else "Select a chat from the list to begin.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textSecondary,
                )
            }
        }
        return
    }

    BackHandler(enabled = onBack != null) { onBack?.invoke() }
    val scrollState = rememberLazyListState()
    val scope = rememberCoroutineScope()
	val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
		uri?.let(onChooseAttachment)
	}
	val microphonePermission = rememberLauncherForActivityResult(
		ActivityResultContracts.RequestPermission(),
	) { granted ->
		if (granted) onStartVoiceRecording()
	}
	val requestVoiceRecording = {
		if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
			onStartVoiceRecording()
		} else {
			microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
		}
	}

    LaunchedEffect(room) { scrollState.scrollToItem(0) }
    val bottomInsets = WindowInsets.navigationBars.union(WindowInsets.ime)

    Scaffold(
        containerColor = colors.canvas,
        topBar = {
            Column {
                TopAppBar(
                    navigationIcon = {
                        if (onBack != null) {
                            IconButton(onClick = onBack) {
                                Icon(
                                    Icons.AutoMirrored.Outlined.ArrowBack,
                                    contentDescription = if (language == "zh-CN") "返回会话列表" else "Back to conversations",
                                )
                            }
                        }
                    },
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            EdgeAvatar(
                                imageUrl = resolveServerUrl(serverBaseUrl, conversation.avatarUrl),
                                displayName = conversation.title,
                                modifier = Modifier.size(40.dp),
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f, fill = false)) {
                                Text(
                                    text = conversation.title,
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = if (conversation.kind == "dm") {
                                        conversation.subtitle
                                    } else {
                                        "${conversation.memberCount} ${if (language == "zh-CN") "位成员" else "members"}"
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = colors.textSecondary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    },
                    actions = {
                        if (conversation.canManage) {
                            IconButton(onClick = onManageGroup) {
                                Icon(Icons.Outlined.Group, contentDescription = if (language == "zh-CN") "管理群组" else "Manage group")
                            }
                        }
                        if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = colors.canvas),
                )
                HorizontalDivider(color = colors.separator)
            }
        },
        contentWindowInsets = ScaffoldDefaults.contentWindowInsets.exclude(bottomInsets),
    ) { paddingValues ->
        // Edge-to-edge 下统一消费键盘和导航栏的较大底边，避免输入区被遮挡或重复叠加高度。
        Column(
            Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .windowInsetsPadding(bottomInsets),
        ) {
            ChatMessages(
                messages = messages,
                outbox = outbox,
                currentUser = currentUser,
                members = members,
                serverBaseUrl = serverBaseUrl,
                language = language,
                scrollState = scrollState,
                onLoadOlder = onLoadOlder,
                onRetry = onRetry,
                onCancel = onCancel,
                onDeleteMessage = onDeleteMessage,
				onOpenAttachment = onOpenAttachment,
				voicePlayback = voicePlayback,
				onToggleVoicePlayback = onToggleVoicePlayback,
				onSeekVoicePlayback = onSeekVoicePlayback,
				onCycleVoicePlaybackSpeed = onCycleVoicePlaybackSpeed,
                modifier = Modifier.weight(1f),
            )
            MessageComposer(
                roomKey = "${room.kind}:${room.id}",
                roomTitle = conversation.title,
                attachment = attachment,
                language = language,
                members = members,
				currentUserId = currentUser.userId,
				recording = voiceRecording,
				onChooseAttachment = { picker.launch("*/*") },
				onClearAttachment = onClearAttachment,
				onStartVoiceRecording = requestVoiceRecording,
				onCancelVoiceRecording = onCancelVoiceRecording,
				onSendVoiceRecording = onSendVoiceRecording,
                onSend = { content, mentionUserIds ->
                    onSend(content, mentionUserIds)
                    scope.launch { scrollState.animateScrollToItem(0) }
                },
            )
        }
    }
}
