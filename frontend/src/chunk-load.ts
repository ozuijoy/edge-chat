import { ref } from 'vue';

export const chunkLoadFailed = ref(false);

export function installChunkLoadRecovery(target: EventTarget) {
  // 部署換版或斷網可能讓舊頁面的按需資源失效；只提示，不自動刷新丟棄聊天草稿。
  const onPreloadError = () => { chunkLoadFailed.value = true; };
  target.addEventListener('vite:preloadError', onPreloadError);
  return () => target.removeEventListener('vite:preloadError', onPreloadError);
}
