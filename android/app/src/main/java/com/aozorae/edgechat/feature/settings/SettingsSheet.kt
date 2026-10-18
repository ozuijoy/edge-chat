package com.aozorae.edgechat.feature.settings

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForwardIos
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Cached
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.aozorae.edgechat.core.network.dto.SessionDto
import com.aozorae.edgechat.ui.components.EdgeAvatar
import com.aozorae.edgechat.ui.components.resolveServerUrl
import com.aozorae.edgechat.ui.theme.LocalEdgeChatColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSheet(
    session: SessionDto,
    serverBaseUrl: String,
    language: String,
    onDismiss: () -> Unit,
    onUpdateProfile: (String) -> Unit,
    onUpdateAvatar: (String, android.net.Uri) -> Unit,
    onChangePassword: (String, String) -> Unit,
    onLanguage: (String) -> Unit,
    onClearCache: () -> Unit,
    diagnosticUri: () -> android.net.Uri,
    onLogout: () -> Unit,
) {
    val context = LocalContext.current
    val colors = LocalEdgeChatColors.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var displayName by remember(session.userId, session.displayName) { mutableStateOf(session.displayName) }
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { onUpdateAvatar(displayName, it) }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        dragHandle = null,
        containerColor = colors.canvas,
    ) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.96f)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Outlined.Close, contentDescription = if (language == "zh-CN") "关闭设置" else "Close settings")
                }
                Text(
                    text = if (language == "zh-CN") "设置" else "Settings",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.textPrimary,
                )
                Spacer(Modifier.size(48.dp))
            }
            HorizontalDivider(color = colors.separator)
            Column(
                modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box {
                        EdgeAvatar(
                            imageUrl = resolveServerUrl(serverBaseUrl, session.avatarUrl),
                            displayName = displayName,
                            modifier = Modifier.size(88.dp),
                        )
                        FilledIconButton(
                            onClick = { avatarPicker.launch("image/*") },
                            modifier = Modifier.align(Alignment.BottomEnd).size(34.dp),
                            shape = CircleShape,
                            colors = IconButtonDefaults.filledIconButtonColors(
                                containerColor = colors.iconPrimary,
                                contentColor = colors.canvas,
                            ),
                        ) {
                            Icon(
                                Icons.Outlined.Edit,
                                contentDescription = if (language == "zh-CN") "更换头像" else "Change avatar",
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Text(displayName, style = MaterialTheme.typography.titleMedium, color = colors.textPrimary)
                    Text("@${session.username}", style = MaterialTheme.typography.bodyMedium, color = colors.textSecondary)
                }

                SettingsSectionTitle(if (language == "zh-CN") "个人资料" else "Profile")
                Column(Modifier.padding(horizontal = 24.dp, vertical = 16.dp)) {
                    OutlinedTextField(
                        value = displayName,
                        onValueChange = { displayName = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(if (language == "zh-CN") "显示名称" else "Display name") },
                        singleLine = true,
                        shape = MaterialTheme.shapes.large,
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = { onUpdateProfile(displayName) },
                        enabled = displayName.isNotBlank(),
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        shape = MaterialTheme.shapes.extraLarge,
                    ) {
                        Text(if (language == "zh-CN") "保存资料" else "Save profile")
                    }
                }

                SettingsSectionTitle(if (language == "zh-CN") "安全" else "Security")
                Column(Modifier.padding(horizontal = 24.dp, vertical = 16.dp)) {
                    OutlinedTextField(
                        value = currentPassword,
                        onValueChange = { currentPassword = it },
                        modifier = Modifier.fillMaxWidth(),
                        visualTransformation = PasswordVisualTransformation(),
                        label = { Text(if (language == "zh-CN") "当前密码" else "Current password") },
                        singleLine = true,
                        shape = MaterialTheme.shapes.large,
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = newPassword,
                        onValueChange = { newPassword = it },
                        modifier = Modifier.fillMaxWidth(),
                        visualTransformation = PasswordVisualTransformation(),
                        label = { Text(if (language == "zh-CN") "新密码" else "New password") },
                        singleLine = true,
                        shape = MaterialTheme.shapes.large,
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        enabled = currentPassword.isNotBlank() && newPassword.isNotBlank(),
                        onClick = {
                            onChangePassword(currentPassword, newPassword)
                            currentPassword = ""
                            newPassword = ""
                        },
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        shape = MaterialTheme.shapes.extraLarge,
                    ) {
                        Text(if (language == "zh-CN") "修改密码" else "Change password")
                    }
                }

                SettingsSectionTitle(if (language == "zh-CN") "语言" else "Language")
                SingleChoiceSegmentedButtonRow(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp),
                ) {
                    listOf("zh-CN" to "中文", "en-US" to "English").forEachIndexed { index, item ->
                        SegmentedButton(
                            selected = language == item.first,
                            onClick = { if (language != item.first) onLanguage(item.first) },
                            shape = SegmentedButtonDefaults.itemShape(index, 2),
                        ) {
                            Text(item.second)
                        }
                    }
                }

                SettingsSectionTitle(if (language == "zh-CN") "数据与支持" else "Data and support")
                SettingsActionRow(
                    icon = Icons.Outlined.Cached,
                    title = if (language == "zh-CN") "清理本地缓存" else "Clear local cache",
                    subtitle = if (language == "zh-CN") "重新同步会话与消息" else "Resync conversations and messages",
                    onClick = onClearCache,
                )
                SettingsActionRow(
                    icon = Icons.Outlined.Share,
                    title = if (language == "zh-CN") "导出诊断日志" else "Export diagnostics",
                    subtitle = if (language == "zh-CN") "分享本机诊断信息" else "Share diagnostics from this device",
                    onClick = {
                        val intent = Intent(Intent.ACTION_SEND)
                            .setType("text/plain")
                            .putExtra(Intent.EXTRA_STREAM, diagnosticUri())
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        context.startActivity(Intent.createChooser(intent, null))
                    },
                )
                SettingsActionRow(
                    icon = Icons.AutoMirrored.Outlined.Logout,
                    title = if (language == "zh-CN") "注销" else "Sign out",
                    subtitle = if (language == "zh-CN") "退出账号并清理本地缓存" else "Sign out and clear local cache",
                    critical = true,
                    onClick = onLogout,
                )
                Spacer(Modifier.height(32.dp))
            }
        }
    }
}

@Composable
private fun SettingsSectionTitle(title: String) {
    val colors = LocalEdgeChatColors.current
    Surface(color = colors.canvasLevel1) {
        Text(
            text = title,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 12.dp),
            style = MaterialTheme.typography.labelLarge,
            color = colors.textSecondary,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun SettingsActionRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    critical: Boolean = false,
) {
    val colors = LocalEdgeChatColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 24.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (critical) colors.critical else colors.iconSecondary,
        )
        Column(Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = if (critical) colors.critical else colors.textPrimary,
            )
            Text(text = subtitle, style = MaterialTheme.typography.bodySmall, color = colors.textSecondary)
        }
        Icon(
            Icons.AutoMirrored.Outlined.ArrowForwardIos,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = colors.iconSecondary,
        )
    }
    HorizontalDivider(modifier = Modifier.padding(start = 64.dp), color = colors.separator)
}
