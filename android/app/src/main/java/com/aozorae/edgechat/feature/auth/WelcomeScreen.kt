package com.aozorae.edgechat.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Link
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.aozorae.edgechat.ui.components.EdgeChatBrandMark
import com.aozorae.edgechat.ui.theme.LocalEdgeChatColors

@Composable
fun WelcomeScreen(
    initialServer: String?,
    loading: Boolean,
    language: String,
    onLogin: (String, String, String) -> Unit,
) {
    var server by rememberSaveable(initialServer) { mutableStateOf(initialServer.orEmpty()) }
    var username by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    val colors = LocalEdgeChatColors.current
    val canLogin = server.isNotBlank() && username.isNotBlank() && password.isNotBlank() && !loading
    val submit = { if (canLogin) onLogin(server, username, password) }

    Scaffold(containerColor = colors.canvas) { contentPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(contentPadding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            EdgeChatBrandMark(size = 72.dp)
            Spacer(Modifier.height(20.dp))
            Text(
                text = if (language == "zh-CN") "登录 EdgeChat" else "Sign in to EdgeChat",
                style = MaterialTheme.typography.headlineSmall,
                color = colors.textPrimary,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = if (language == "zh-CN") {
                    "输入服务器地址和账号，继续你的对话"
                } else {
                    "Enter your server and account to continue your conversations."
                },
                modifier = Modifier.widthIn(max = 460.dp),
                style = MaterialTheme.typography.bodyLarge,
                color = colors.textSecondary,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(28.dp))
            Column(modifier = Modifier.fillMaxWidth().widthIn(max = 520.dp)) {
                OutlinedTextField(
                    value = server,
                    onValueChange = { server = it },
                    modifier = Modifier.fillMaxWidth().testTag("serverField"),
                    enabled = !loading,
                    singleLine = true,
                    label = { Text(if (language == "zh-CN") "服务器地址" else "Server address") },
                    placeholder = { Text("https://chat.example.com") },
                    leadingIcon = { Icon(Icons.Outlined.Link, contentDescription = null) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                    shape = MaterialTheme.shapes.large,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    modifier = Modifier.fillMaxWidth().testTag("usernameField"),
                    enabled = !loading,
                    singleLine = true,
                    label = { Text(if (language == "zh-CN") "用户名" else "Username") },
                    leadingIcon = { Icon(Icons.Outlined.AccountCircle, contentDescription = null) },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    shape = MaterialTheme.shapes.large,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    modifier = Modifier.fillMaxWidth().testTag("passwordField"),
                    enabled = !loading,
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
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                    shape = MaterialTheme.shapes.large,
                )
                Spacer(Modifier.height(20.dp))
                Button(
                    onClick = submit,
                    enabled = canLogin,
                    modifier = Modifier.fillMaxWidth().height(56.dp).testTag("loginButton"),
                    shape = MaterialTheme.shapes.extraLarge,
                ) {
                    if (loading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text(if (language == "zh-CN") "登录" else "Sign in")
                    }
                }
            }
        }
    }
}
