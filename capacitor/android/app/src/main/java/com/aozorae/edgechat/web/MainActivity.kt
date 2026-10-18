package com.aozorae.edgechat.web

import android.os.Bundle
import com.aozorae.edgechat.web.nativebridge.EdgeChatNativePlugin
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // 插件在 Bridge 創建前註冊，保證冷啟動通知也能把目標會話交給網頁層。
        registerPlugin(EdgeChatNativePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
