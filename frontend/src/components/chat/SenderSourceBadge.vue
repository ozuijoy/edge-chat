<script setup>
import { t } from '../../i18n.js';

defineProps({
  instance: { type: String, default: '' },
  source: {
    type: String,
    default: ''
  }
});
</script>

<template>
  <span v-if="source === 'telegram'" class="sender-source-badge" title="Telegram" :aria-label="t('telegram.source')">
    TG
  </span>
  <span v-else-if="source === 'instance-bridge'" class="sender-instance-badge" :title="instance">
    EdgeChat · {{ instance.replace(/^https:\/\//, '') }}
  </span>
</template>

<style scoped>
.sender-instance-badge { font-size: 10px; font-weight: 600; overflow-wrap: anywhere; color: var(--chat-text-secondary); }
.sender-source-badge {
  min-width: 20px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: 4px;
  border-radius: 4px;
  background: #229ed9;
  color: #ffffff;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0;
  vertical-align: 1px;
}
</style>
