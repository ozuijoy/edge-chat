import { createApp } from 'vue';
import { Capacitor } from '@capacitor/core';
import App from './App.vue';
import router from './router.js';
import store from './store.js';
import {
  installCapacitorIntegration,
  queueNativeRoomTarget
} from './capacitor-platform.ts';
import './styles/base.css';
import './styles.css';
import './styles-liquid.css';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/ui.css';
import './styles/color-themes.css';
import { initLiquidGlass } from './liquid-glass.js';
import { initializeI18n } from './i18n.js';
import { parseNotificationRoomTarget, takeNotificationRoomTarget } from './notification-target.js';
import { installChunkLoadRecovery } from './chunk-load.ts';

installChunkLoadRecovery(window);

// 點擊通知後新打開的窗口從 URL 恢復會話；登錄後聊天頁也能消費這個目標。
const isCapacitorNative = Capacitor.isNativePlatform();
const initialNotificationTarget = isCapacitorNative ? null : takeNotificationRoomTarget(window);
if (initialNotificationTarget) queueNativeRoomTarget(initialNotificationTarget);

// 註冊 Service Worker，使 Chrome/Edge 滿足 PWA 可安裝條件（地址欄安裝按鈕）。
// 僅在瀏覽器支持且非 Capacitor 原生環境下注冊。
if ('serviceWorker' in navigator && !isCapacitorNative) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 註冊失敗不影響應用功能，忽略即可。
    });
  });

  // 系統通知（Service Worker 彈出）被點擊時，打開對應會話。
  navigator.serviceWorker.addEventListener('message', (event) => {
    const payload = event.data;
    if (payload?.type !== 'edgechat:notification-click') return;
    const target = parseNotificationRoomTarget(payload.data);
    if (!target) return;
    queueNativeRoomTarget(target);
    void router.push('/');
  });
}

// 應用自定義背景
const customBg = localStorage.getItem('customBackground');
if (customBg) {
  document.body.style.background = customBg;
}

initializeI18n().then(() => store.initialize()).finally(() => {
  const app = createApp(App);
  app.use(router);
  app.mount('#app');
  if (typeof document.modelContext?.registerTool === 'function') {
    void import('./webmcp.ts').then(({ registerEdgeChatWebMcp }) => registerEdgeChatWebMcp()).catch(() => {
      // 實驗性瀏覽器集成不可用時，普通聊天仍應正常啟動。
    });
  }
  void installCapacitorIntegration({
    async onOpenRoom(target) {
      await router.push('/');
      queueNativeRoomTarget(target);
    }
  });

  // 初始化 Liquid Glass 效果
  setTimeout(initLiquidGlass, 100);
});
