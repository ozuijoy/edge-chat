package com.aozorae.edgechat.feature.conversations

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Switch
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.aozorae.edgechat.core.database.UserEntity
import com.aozorae.edgechat.ui.components.EdgeAvatar
import com.aozorae.edgechat.ui.theme.LocalEdgeChatColors

@Composable
fun NewConversationDialog(
    users: List<UserEntity>,
    language: String,
    onDismiss: () -> Unit,
    onOpenDm: (Long) -> Unit,
    onCreateGroup: (String, String, String, List<Long>) -> Unit,
) {
    val colors = LocalEdgeChatColors.current
    var groupMode by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var privateGroup by remember { mutableStateOf(true) }
    var selectedUsers by remember { mutableStateOf(setOf<Long>()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = colors.canvas,
        title = { Text(if (language == "zh-CN") "新建会话" else "New conversation") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    listOf(false, true).forEachIndexed { index, isGroup ->
                        SegmentedButton(
                            selected = groupMode == isGroup,
                            onClick = { groupMode = isGroup },
                            shape = SegmentedButtonDefaults.itemShape(index, 2),
                        ) {
                            Text(
                                if (isGroup) {
                                    if (language == "zh-CN") "群组" else "Group"
                                } else if (language == "zh-CN") "私信" else "Direct"
                            )
                        }
                    }
                }
                if (groupMode) {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text(if (language == "zh-CN") "群组名称" else "Group name") },
                    )
                    OutlinedTextField(
                        value = description,
                        onValueChange = { description = it },
                        modifier = Modifier.fillMaxWidth(),
                        maxLines = 3,
                        label = { Text(if (language == "zh-CN") "描述" else "Description") },
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            if (language == "zh-CN") "仅受邀成员可见" else "Invite-only group",
                            modifier = Modifier.weight(1f),
                        )
                        Switch(checked = privateGroup, onCheckedChange = { privateGroup = it })
                    }
                }
                Text(if (language == "zh-CN") "选择成员" else "Choose people")
                LazyColumn(Modifier.fillMaxWidth().heightIn(max = 280.dp)) {
                    items(users, key = { it.id }) { user ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    if (!groupMode) onOpenDm(user.id)
                                    else selectedUsers = if (user.id in selectedUsers) {
                                        selectedUsers - user.id
                                    } else {
                                        selectedUsers + user.id
                                    }
                                }
                                .padding(vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            EdgeAvatar(user.avatarUrl, user.displayName, Modifier.size(40.dp))
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(user.displayName)
                                Text("@${user.username}", style = androidx.compose.material3.MaterialTheme.typography.bodySmall, color = colors.textSecondary)
                            }
                            if (groupMode) Checkbox(user.id in selectedUsers, null)
                        }
                        HorizontalDivider(color = colors.separator)
                    }
                }
            }
        },
        confirmButton = {
            if (groupMode) {
                Button(
                    enabled = name.isNotBlank(),
                    onClick = { onCreateGroup(name, description, if (privateGroup) "private" else "public", selectedUsers.toList()) },
                ) { Text(if (language == "zh-CN") "创建" else "Create") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(if (language == "zh-CN") "取消" else "Cancel") } },
    )
}
