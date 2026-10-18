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

      // 後臺內容區擁有獨立滾動容器，因此主動滾動到錨點，保證摺疊菜單跳轉穩定。
      await nextTick();
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.querySelector(hash)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    },
    { immediate: true }
  );
}
