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
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.aozorae.edgechat.ui.theme.LocalEdgeChatColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServerSetupScreen(
    loading: Boolean,
    preset: String?,
    language: String,
    onConnect: (String) -> Unit,
    onBack: (() -> Unit)? = null,
) {
    var server by rememberSaveable { mutableStateOf("") }
    val colors = LocalEdgeChatColors.current
    LaunchedEffect(preset) { if (!preset.isNullOrBlank()) server = preset }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Outlined.ArrowBack,
                                contentDescription = if (language == "zh-CN") "返回" else "Back",
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = colors.canvas),
            )
        },
        containerColor = colors.canvas,
    ) { contentPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(contentPadding)
                .imePadding()
                .padding(horizontal = 24.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.weight(0.55f))
            Surface(
                color = colors.subtleSecondary,
                shape = MaterialTheme.shapes.extraLarge,
            ) {
                Icon(
                    Icons.Outlined.Dns,
                    contentDescription = null,
                    modifier = Modifier.padding(22.dp).size(40.dp),
                    tint = colors.iconPrimary,
                )
            }
            Spacer(Modifier.height(28.dp))
            Text(
                text = if (language == "zh-CN") "选择你的服务器" else "Choose your server",
                style = MaterialTheme.typography.headlineSmall,
                color = colors.textPrimary,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = if (language == "zh-CN") {
                    "输入 EdgeChat 服务地址以验证连接"
                } else {
                    "Enter your EdgeChat server address to verify the connection."
                },
                modifier = Modifier.widthIn(max = 460.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = colors.textSecondary,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(36.dp))
            OutlinedTextField(
                value = server,
                onValueChange = { server = it },
                modifier = Modifier.widthIn(max = 520.dp).fillMaxWidth(),
                singleLine = true,
                label = { Text(if (language == "zh-CN") "服务器地址" else "Server address") },
                placeholder = { Text("https://chat.example.com") },
                leadingIcon = { Icon(Icons.Outlined.Link, contentDescription = null) },
                shape = MaterialTheme.shapes.large,
            )
            Spacer(Modifier.weight(1f))
            Button(
                onClick = { onConnect(server) },
                enabled = server.isNotBlank() && !loading,
                modifier = Modifier.widthIn(max = 520.dp).fillMaxWidth().height(56.dp),
                shape = MaterialTheme.shapes.extraLarge,
            ) {
                if (loading) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text(if (language == "zh-CN") "验证并继续" else "Verify and continue")
                }
            }
        }
    }
}
