package com.aozorae.edgechat.feature.auth

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.aozorae.edgechat.core.session.ServerProfile
import com.aozorae.edgechat.ui.components.EdgeChatBrandMark
import com.aozorae.edgechat.ui.theme.LocalEdgeChatColors

@Composable
fun LoginScreen(
    server: ServerProfile,
    loading: Boolean,
    language: String,
    onLogin: (String, String) -> Unit,
    onChangeServer: () -> Unit,
) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    val colors = LocalEdgeChatColors.current

    Scaffold(containerColor = colors.canvas) { contentPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(contentPadding)
                .imePadding()
                .padding(horizontal = 24.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.weight(0.45f))
            EdgeChatBrandMark(size = 80.dp)
            Spacer(Modifier.height(24.dp))
            Text(
                text = if (language == "zh-CN") "登录 ${server.siteName}" else "Sign in to ${server.siteName}",
                style = MaterialTheme.typography.headlineSmall,
                color = colors.textPrimary,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            Text(server.baseUrl, style = MaterialTheme.typography.bodyMedium, color = colors.textSecondary)
            TextButton(onClick = onChangeServer) {
                Text(if (language == "zh-CN") "更换服务器" else "Change server")
            }
            Spacer(Modifier.height(24.dp))
            Column(modifier = Modifier.fillMaxWidth().widthIn(max = 520.dp)) {
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text(if (language == "zh-CN") "用户名" else "Username") },
                    leadingIcon = { Icon(Icons.Outlined.AccountCircle, contentDescription = null) },
                    shape = MaterialTheme.shapes.large,
                )
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    label = { Text(if (language == "zh-CN") "密码" else "Password") },
                    leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null) },
                    trailingIcon = {
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(
                                if (passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                contentDescription = if (language == "zh-CN") "切换密码可见性" else "Toggle password visibility",
                            )
                        }
                    },
                    shape = MaterialTheme.shapes.large,
                )
            }
            Spacer(Modifier.weight(1f))
            Button(
                onClick = { onLogin(username, password) },
                enabled = username.isNotBlank() && password.isNotBlank() && !loading,
                modifier = Modifier.widthIn(max = 520.dp).fillMaxWidth().height(56.dp),
                shape = MaterialTheme.shapes.extraLarge,
            ) {
                if (loading) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text(if (language == "zh-CN") "登录" else "Sign in")
                }
            }
        }
    }
}
