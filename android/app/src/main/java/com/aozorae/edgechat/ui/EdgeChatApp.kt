package com.aozorae.edgechat.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aozorae.edgechat.core.database.ConversationEntity
import com.aozorae.edgechat.core.network.dto.SessionDto
import com.aozorae.edgechat.core.session.ServerProfile
import com.aozorae.edgechat.feature.app.AppViewModel
import com.aozorae.edgechat.feature.auth.WelcomeScreen
import com.aozorae.edgechat.feature.chat.ChatPane
import com.aozorae.edgechat.feature.chat.ChatUiState
import com.aozorae.edgechat.feature.chat.ChatViewModel
import com.aozorae.edgechat.feature.chat.GroupManagementDialog
import com.aozorae.edgechat.feature.conversations.ConversationPane
import com.aozorae.edgechat.feature.settings.SettingsSheet
import com.aozorae.edgechat.ui.theme.LocalEdgeChatColors
import kotlinx.coroutines.flow.StateFlow

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EdgeChatApp(
    deepLinkServer: StateFlow<String?>,
    appViewModel: AppViewModel = hiltViewModel(),
    chatViewModel: ChatViewModel = hiltViewModel(),
) {
    val appState by appViewModel.state.collectAsStateWithLifecycle()
    val chatState by chatViewModel.state.collectAsStateWithLifecycle()
    val preset by deepLinkServer.collectAsStateWithLifecycle()
    var showSettings by remember { mutableStateOf(false) }
    var showGroup by remember { mutableStateOf(false) }
    var handledPreset by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(preset, appState.initializing) {
        if (!appState.initializing && !preset.isNullOrBlank() && preset != handledPreset) {
            handledPreset = preset
            if (appState.session != null && preset != appState.server?.baseUrl) {
                appViewModel.connect(requireNotNull(preset))
            }
        }
    }

    when {
        appState.initializing -> {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        }
        appState.session == null -> {
            WelcomeScreen(
                initialServer = preset ?: appState.server?.baseUrl,
                loading = appState.loading,
                language = appState.language,
                onLogin = appViewModel::connectAndLogin,
            )
        }
        else -> {
            val session = requireNotNull(appState.session)
            val server = requireNotNull(appState.server)
            val selectedConversation = chatState.selectedRoom?.let { room ->
                chatState.conversations.firstOrNull { it.kind == room.kind && it.id == room.id }
            }

            AuthenticatedShell(
                server = server,
                session = session,
                chatState = chatState,
                selectedConversation = selectedConversation,
                language = appState.language,
                chatViewModel = chatViewModel,
                onSettings = { showSettings = true },
                onManageGroup = { showGroup = true },
            )

            if (showSettings) {
                SettingsSheet(
                    session = session,
                    serverBaseUrl = server.baseUrl,
                    language = appState.language,
                    onDismiss = { showSettings = false },
                    onUpdateProfile = appViewModel::updateProfile,
                    onUpdateAvatar = appViewModel::updateAvatar,
                    onChangePassword = appViewModel::changePassword,
                    onLanguage = appViewModel::setLanguage,
                    onClearCache = appViewModel::clearCache,
                    diagnosticUri = appViewModel::diagnosticUri,
                    onLogout = { showSettings = false; appViewModel.logout() },
                )
            }
            if (showGroup && selectedConversation != null) {
                GroupManagementDialog(
                    conversation = selectedConversation,
                    members = chatState.members,
                    users = chatState.users,
                    language = appState.language,
                    onLoad = { chatViewModel.loadMembers(selectedConversation.id) },
                    onRename = { chatViewModel.renameGroup(selectedConversation.id, it) },
                    onInvite = { chatViewModel.invite(selectedConversation.id, it) },
                    onRemove = { chatViewModel.removeMember(selectedConversation.id, it) },
                    onDelete = { showGroup = false; chatViewModel.deleteGroup(selectedConversation.id) },
                    onDismiss = { showGroup = false },
                )
            }
        }
    }

    val failure = appState.error ?: chatState.error
    if (failure != null) {
        AlertDialog(
            onDismissRequest = { appViewModel.clearError(); chatViewModel.clearError() },
            title = { Text(if (appState.language == "zh-CN") "操作失败" else "Something went wrong") },
            text = { Text(failure) },
            confirmButton = {
                TextButton(onClick = { appViewModel.clearError(); chatViewModel.clearError() }) {
                    Text(if (appState.language == "zh-CN") "知道了" else "OK")
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AuthenticatedShell(
    server: ServerProfile,
    session: SessionDto,
    chatState: ChatUiState,
    selectedConversation: ConversationEntity?,
    language: String,
    chatViewModel: ChatViewModel,
    onSettings: () -> Unit,
    onManageGroup: () -> Unit,
) {
    val colors = LocalEdgeChatColors.current
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val expanded = maxWidth >= 840.dp
        if (expanded) {
            Row(Modifier.fillMaxSize()) {
                Box(Modifier.width(360.dp)) {
                    ConversationContent(
                        server,
                        session,
                        chatState,
                        language,
                        chatViewModel,
                        onSettings,
                    )
                }
                VerticalDivider(color = colors.separator)
                Box(Modifier.weight(1f)) {
                    ChatContent(
                        server = server,
                        session = session,
                        chatState = chatState,
                        selectedConversation = selectedConversation,
                        language = language,
                        chatViewModel = chatViewModel,
                        onBack = null,
                        onManageGroup = onManageGroup,
                    )
                }
            }
        } else if (chatState.selectedRoom == null) {
            ConversationContent(server, session, chatState, language, chatViewModel, onSettings)
        } else {
            ChatContent(
                server = server,
                session = session,
                chatState = chatState,
                selectedConversation = selectedConversation,
                language = language,
                chatViewModel = chatViewModel,
                onBack = { chatViewModel.select(null) },
                onManageGroup = onManageGroup,
            )
        }
    }
}

@Composable
private fun ConversationContent(
    server: ServerProfile,
    session: SessionDto,
    chatState: ChatUiState,
    language: String,
    chatViewModel: ChatViewModel,
    onSettings: () -> Unit,
) {
    ConversationPane(
        siteName = server.siteName,
        serverBaseUrl = server.baseUrl,
        currentUser = session,
        conversations = chatState.conversations,
        users = chatState.users,
        selected = chatState.selectedRoom,
        language = language,
        onSelect = chatViewModel::select,
        onJoin = chatViewModel::join,
        onOpenDm = chatViewModel::openDm,
        onCreateGroup = chatViewModel::createGroup,
        onSettings = onSettings,
    )
}

@Composable
private fun ChatContent(
    server: ServerProfile,
    session: SessionDto,
    chatState: ChatUiState,
    selectedConversation: ConversationEntity?,
    language: String,
    chatViewModel: ChatViewModel,
    onBack: (() -> Unit)?,
    onManageGroup: () -> Unit,
) {
    ChatPane(
        room = chatState.selectedRoom,
        conversation = selectedConversation,
        messages = chatState.messages,
		outbox = chatState.outbox,
		attachment = chatState.attachment,
		voiceRecording = chatState.voiceRecording,
		voicePlayback = chatState.voicePlayback,
        members = chatState.members,
        currentUser = session,
        serverBaseUrl = server.baseUrl,
        busy = chatState.busy,
        language = language,
        openAttachmentEvents = chatViewModel.openAttachment,
        onBack = onBack,
        onLoadOlder = chatViewModel::loadOlder,
        onSend = chatViewModel::send,
		onChooseAttachment = chatViewModel::chooseAttachment,
		onClearAttachment = chatViewModel::clearAttachment,
		onStartVoiceRecording = chatViewModel::startVoiceRecording,
		onCancelVoiceRecording = chatViewModel::cancelVoiceRecording,
		onSendVoiceRecording = chatViewModel::sendVoiceRecording,
		onToggleVoicePlayback = chatViewModel::toggleVoicePlayback,
		onSeekVoicePlayback = chatViewModel::seekVoicePlayback,
		onCycleVoicePlaybackSpeed = chatViewModel::cycleVoicePlaybackSpeed,
        onRetry = chatViewModel::retry,
        onCancel = chatViewModel::cancel,
        onDeleteMessage = chatViewModel::deleteMessage,
        onOpenAttachment = chatViewModel::openAttachment,
        onManageGroup = onManageGroup,
    )
}
