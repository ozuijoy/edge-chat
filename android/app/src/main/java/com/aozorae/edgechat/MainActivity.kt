package com.aozorae.edgechat

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import com.aozorae.edgechat.core.realtime.RealtimeCoordinator
import com.aozorae.edgechat.ui.EdgeChatApp
import com.aozorae.edgechat.ui.theme.EdgeChatTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var realtime: RealtimeCoordinator
    private val deepLinkServer = MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        handleIntent(intent)
        setContent {
            EdgeChatTheme {
                EdgeChatApp(deepLinkServer)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onStart() {
        super.onStart()
        realtime.start()
    }

    override fun onStop() {
        realtime.stop()
        super.onStop()
    }

    private fun handleIntent(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == "edgechat" && uri.host == "connect") {
            lifecycleScope.launch {
                deepLinkServer.emit(uri.getQueryParameter("server") ?: uri.getQueryParameter("url"))
            }
        }
    }
}
