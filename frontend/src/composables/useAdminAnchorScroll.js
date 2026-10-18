import { nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';

export function useAdminAnchorScroll() {
  const route = useRoute();

  watch(
    () => route.hash,
    async (hash) => {
      if (!hash) {
        return;
      }

      // 后台内容区拥有独立滚动容器，因此主动滚动到锚点，保证折叠菜单跳转稳定。
      await nextTick();
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.querySelector(hash)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    },
    { immediate: true }
  );
}
