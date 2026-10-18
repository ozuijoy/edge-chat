<script setup lang="ts">
import { RotateCw, X } from '@lucide/vue';
import { chunkLoadFailed } from '../chunk-load.ts';
import { useI18n } from '../i18n.js';

const { t } = useI18n();
const reload = () => window.location.reload();
</script>

<template>
  <div v-if="chunkLoadFailed" class="chunk-load-notice" role="alert">
    <span>{{ t('common.chunkLoadFailed') }}</span>
    <button type="button" class="ui-button" @click="reload">
      <RotateCw :size="16" aria-hidden="true" />
      {{ t('common.reload') }}
    </button>
    <button type="button" class="ui-button chunk-load-notice__close" :aria-label="t('common.close')" :title="t('common.close')" @click="chunkLoadFailed = false">
      <X :size="16" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.chunk-load-notice {
  position: fixed;
  z-index: 10000;
  inset: auto 12px calc(12px + env(safe-area-inset-bottom));
  margin-inline: auto;
  max-width: 640px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #e8ecf0;
  border-radius: 8px;
  background: #fff;
  color: #111b21;
  box-shadow: 0 4px 20px #0002;
  font: 14px/1.5 system-ui, sans-serif;
}
.chunk-load-notice span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.chunk-load-notice button { flex: 0 0 auto; width: auto; }
.chunk-load-notice .chunk-load-notice__close { width: 38px; padding: 0; }
@media (max-width: 480px) {
  .chunk-load-notice { flex-wrap: wrap; }
  .chunk-load-notice span { flex-basis: 100%; }
}
</style>
