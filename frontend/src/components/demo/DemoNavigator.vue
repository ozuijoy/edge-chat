<script setup>
import { RotateCcw, Star } from '@lucide/vue';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { resetRuntime } from '../../runtime.js';
import { t } from '../../i18n.js';

const route = useRoute();
const router = useRouter();

const pages = [
  { labelKey: 'demo.chat', value: '/' },
  { labelKey: 'demo.contacts', value: '/contacts' },
  { labelKey: 'demo.settings', value: '/settings' },
  { labelKey: 'demo.dashboard', value: '/admin/dashboard' },
  { labelKey: 'demo.users', value: '/admin/users' },
  { labelKey: 'demo.invites', value: '/admin/invites' },
  { labelKey: 'demo.telegram', value: '/admin/telegram' },
  { labelKey: 'demo.site', value: '/admin/site' },
  { labelKey: 'admin.nav.maintenance', value: '/admin/maintenance' },
  { labelKey: 'demo.login', value: '/login' },
  { labelKey: 'demo.register', value: '/register/demo-invite' }
];

const currentPage = computed(() => {
  const match = pages.find((page) => page.value === route.path);
  return match?.value || '/';
});

function navigate(event) {
  void router.push(event.target.value);
}

function resetDemo() {
  resetRuntime();
  localStorage.removeItem('customBackground');
  window.location.assign('/');
}
</script>

<template>
  <aside
    class="demo-navigator"
    :class="{
      'demo-navigator--admin': route.path.startsWith('/admin'),
      'demo-navigator--contacts': route.path === '/contacts'
    }"
    :aria-label="t('demo.navigation')"
  >
    <span class="demo-navigator__badge">{{ t('demo.local') }}</span>
    <select :value="currentPage" :aria-label="t('demo.selectPage')" @change="navigate">
      <option v-for="page in pages" :key="page.value" :value="page.value">
        {{ t(page.labelKey) }}
      </option>
    </select>
    <button type="button" :title="t('demo.reset')" :aria-label="t('demo.reset')" @click="resetDemo">
      <RotateCcw :size="16" aria-hidden="true" />
    </button>
    <!-- 演示站訪客剛體驗完產品，是最可能點 Star 的人群；生產構建會靜態刪除整個 DemoNavigator。 -->
    <a
      class="demo-navigator__star"
      href="https://github.com/aozorae/Edgechat"
      target="_blank"
      rel="noopener noreferrer"
      :title="t('demo.star')"
      :aria-label="t('demo.star')"
    >
      <Star :size="15" aria-hidden="true" />
      <span>Star</span>
    </a>
  </aside>
</template>

<style scoped>
.demo-navigator {
  position: fixed;
  top: 68px;
  right: 12px;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  padding: 5px 6px 5px 10px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 8px;
  background: rgba(248, 251, 254, 0.88);
  box-shadow: 0 8px 24px rgba(35, 54, 76, 0.16);
  backdrop-filter: blur(18px) saturate(150%);
  color: #23405f;
}

.demo-navigator__badge {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.demo-navigator select {
  width: 138px;
  height: 28px;
  border: 1px solid rgba(70, 105, 139, 0.22);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.82);
  color: #203b57;
  font: inherit;
  font-size: 12px;
  padding: 0 24px 0 8px;
}

.demo-navigator button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #426584;
  cursor: pointer;
}

.demo-navigator button:hover,
.demo-navigator button:focus-visible {
  background: rgba(80, 126, 167, 0.12);
  outline: none;
}

.demo-navigator__star {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid #d5b65c;
  border-radius: 8px;
  background: #fff2c4;
  color: #73500c;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}

.demo-navigator__star:hover {
  background: #ffe49a;
  border-color: #b9912e;
}

.demo-navigator__star:active {
  background: #f5d47c;
}

.demo-navigator__star:focus-visible {
  outline: 2px solid #73500c;
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .demo-navigator {
    top: 68px;
    right: 8px;
  }

  .demo-navigator__badge {
    display: none;
  }

  .demo-navigator select {
    width: 124px;
  }

  .demo-navigator__star {
    width: 44px;
    height: 44px;
    padding: 0;
  }

  .demo-navigator__star span {
    display: none;
  }

  .demo-navigator--admin,
  .demo-navigator--contacts {
    top: auto;
    bottom: 8px;
  }
}
</style>

<style>
@media (max-width: 640px) {
  /* 聊天頁出現置頂條時把演示導航移到輸入區上方，避免遮擋真實功能文案。 */
  body:has(.pinned-message-bar) .demo-navigator:not(.demo-navigator--admin) {
    top: auto;
    bottom: calc(116px + env(safe-area-inset-bottom));
  }

	/* 窄屏演示導航懸浮在輸入區上方，因此給消息流留出同等空間，保證最新回覆不會被遮住。 */
		body:has(.pinned-message-bar) .chat-messages {
			padding-bottom: calc(72px + env(safe-area-inset-bottom));
		}

  body:has(.contacts-page) .contacts-page__body {
    padding-bottom: calc(64px + env(safe-area-inset-bottom));
  }

  /* 成員管理使用整屏覆蓋層，演示導航不能浮在其上方搶佔觸控區域。 */
  body:has(.room-management-layer) .demo-navigator,
  body:has(.composer-rich-editor) .demo-navigator,
  body:has(.composer-attachment) .demo-navigator,
  body:has(.composer-reply) .demo-navigator {
    display: none;
  }
}
</style>
