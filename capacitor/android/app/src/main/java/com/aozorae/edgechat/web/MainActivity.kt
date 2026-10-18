package com.aozorae.edgechat.web

import android.os.Bundle
import com.aozorae.edgechat.web.nativebridge.EdgeChatNativePlugin
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // 插件在 Bridge 创建前注册，保证冷启动通知也能把目标会话交给网页层。
        registerPlugin(EdgeChatNativePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
