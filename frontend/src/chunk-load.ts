import { ref } from 'vue';

export const chunkLoadFailed = ref(false);

export function installChunkLoadRecovery(target: EventTarget) {
  // 部署换版或断网可能让旧页面的按需资源失效；只提示，不自动刷新丢弃聊天草稿。
  const onPreloadError = () => { chunkLoadFailed.value = true; };
  target.addEventListener('vite:preloadError', onPreloadError);
  return () => target.removeEventListener('vite:preloadError', onPreloadError);
}
