<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Ghost } from '@lucide/vue';
import api from '../api.js';
import UiButton from '../components/ui/Button.vue';
import UiSurface from '../components/ui/Surface.vue';
import { t } from '../i18n.js';
import { isDemoMode } from '../runtime.js';

const enabled = ref(false);
const loaded = ref(false);
const busy = ref(false);
const error = ref('');
const saved = ref(false);

async function load() {
  busy.value = true;
  error.value = '';
  try {
    enabled.value = (await api.adminStealth()).enabled;
    loaded.value = true;
  } catch {
    error.value = t('stealth.loadFailed');
  } finally {
    busy.value = false;
  }
}

async function toggle(event: Event) {
  // 开关只反映服务器已确认的值；保存失败时不留下浏览器默认切换后的假状态。
  (event.target as HTMLInputElement).checked = enabled.value;
  busy.value = true;
  error.value = '';
  saved.value = false;
  try {
    const state = await api.saveAdminStealth(!enabled.value);
    enabled.value = state.enabled;
    saved.value = true;
    // 重新获取服务器注入的路径与 Cookie 状态，避免切换后继续使用旧运行时元数据。
    if (!isDemoMode) window.location.reload();
  } catch {
    error.value = t('stealth.saveFailed');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="admin-section stealth-page">
    <UiSurface class="panel stealth-panel" :aria-busy="busy">
      <div class="stealth-control">
        <div class="stealth-heading">
          <Ghost :size="24" aria-hidden="true" />
          <div>
            <h2 id="stealth-title">{{ t('stealth.title') }}</h2>
            <p aria-live="polite">{{ busy ? t('common.processing') : !loaded ? t('common.loading') : t(enabled ? 'stealth.on' : 'stealth.off') }}</p>
          </div>
        </div>
        <label class="stealth-switch" :class="{ 'is-disabled': busy || !loaded }">
          <input
            type="checkbox"
            :checked="enabled"
            aria-labelledby="stealth-title"
            aria-describedby="stealth-description"
            :disabled="busy || !loaded"
            @change="toggle"
          />
          <span aria-hidden="true"></span>
        </label>
      </div>
      <div class="stealth-copy">
        <p id="stealth-description">{{ t('stealth.description') }}</p>
        <p>{{ t('stealth.scope') }}</p>
        <p>{{ t('stealth.compatibility') }}</p>
        <p class="muted">{{ t('stealth.boundary') }}</p>
        <p v-if="isDemoMode" class="muted">{{ t('stealth.demo') }}</p>
      </div>
      <p v-if="error" role="alert" class="error-text">{{ error }}</p>
      <UiButton v-if="!loaded && !busy" variant="secondary" @click="load">{{ t('common.retry') }}</UiButton>
      <p v-if="saved" role="status">{{ t('stealth.saved') }}</p>
    </UiSurface>
  </div>
</template>

<style scoped>
.stealth-panel { max-width: 720px; width: 100%; box-sizing: border-box; }
.stealth-control { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 24px; border-bottom: 1px solid var(--admin-border); }
.stealth-heading { display: flex; align-items: center; gap: 12px; min-width: 0; }
.stealth-heading > svg { flex-shrink: 0; color: var(--admin-green); }
.stealth-heading h2 { margin: 0; font-size: 20px; line-height: 1.4; }
.stealth-heading p { margin: 4px 0 0; color: var(--admin-muted); font-size: 13px; }
.stealth-switch { position: relative; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 56px; height: 44px; padding: 0; border: 0; background: transparent; cursor: pointer; border-radius: 12px; }
.stealth-switch input { position: absolute; width: 1px; height: 1px; opacity: 0; padding: 0; margin: 0; }
.stealth-switch > span { display: block; position: relative; width: 48px; height: 28px; border-radius: 999px; background: var(--admin-muted); transition: background-color 160ms ease; }
.stealth-switch > span::after { content: ''; position: absolute; top: 4px; left: 4px; width: 20px; height: 20px; border-radius: 50%; background: var(--admin-panel); transition: transform 160ms ease; }
.stealth-switch input:checked + span { background: var(--admin-green); }
.stealth-switch input:checked + span::after { transform: translateX(20px); }
.stealth-switch input:focus-visible + span { outline: 2px solid var(--admin-focus); outline-offset: 3px; }
.stealth-switch.is-disabled { cursor: not-allowed; opacity: .55; }
.stealth-copy { padding-top: 16px; }
.stealth-copy p { margin: 0 0 14px; font-size: 14px; line-height: 1.8; overflow-wrap: anywhere; }
@media (max-width: 420px) { .stealth-control { gap: 12px; } .stealth-heading h2 { font-size: 18px; } }
@media (prefers-reduced-motion: reduce) { .stealth-switch > span, .stealth-switch > span::after { transition: none; } }
</style>
