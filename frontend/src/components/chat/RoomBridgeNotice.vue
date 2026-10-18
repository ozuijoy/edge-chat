<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Link2, RefreshCw } from '@lucide/vue';
import api from '../../api.js';
import { t } from '../../i18n.js';

const props = defineProps({ roomId: { type: Number, required: true } });
const binding = ref(null);
const failed = ref(false);
const loading = ref(false);
let generation = 0;
async function load() {
  const current = ++generation;
  loading.value = true;
  try {
    const result = await api.roomInstanceBridge(props.roomId);
    if (current === generation) { binding.value = result.binding; failed.value = false; }
  } catch {
    if (current === generation) failed.value = true;
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(() => props.roomId, () => { binding.value = null; void load(); }, { immediate: true });
onMounted(() => window.addEventListener('focus', load));
onBeforeUnmount(() => { generation++; window.removeEventListener('focus', load); });
</script>

<template>
  <div v-if="binding || failed" class="room-bridge-notice" role="status">
    <Link2 :size="16" aria-hidden="true" />
    <div>
      <strong v-if="binding">{{ t('bridge.roomNotice', { origin: binding.peerOrigin, group: binding.peerChannelName }) }}</strong>
      <span v-if="binding"> · {{ t(`bridge.status.${binding.status}`) }}{{ binding.localPaused || binding.peerPaused ? ` · ${t('common.paused')}` : '' }}</span>
      <p>{{ failed ? t('bridge.loadFailed') : t('bridge.scope') }}</p>
    </div>
    <button type="button" :disabled="loading" :aria-label="t('bridge.refresh')" @click="load"><RefreshCw :size="15" aria-hidden="true" /></button>
  </div>
</template>

<style scoped>
.room-bridge-notice { display: flex; gap: 10px; align-items: flex-start; padding: 10px 16px; font-size: 12px; line-height: 1.5; border-bottom: 1px solid var(--chat-border); background: var(--chat-surface); color: var(--chat-text-secondary); }
.room-bridge-notice > svg { flex-shrink: 0; margin-top: 3px; }
.room-bridge-notice > div { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.room-bridge-notice strong { font-weight: 600; }
.room-bridge-notice p { margin: 2px 0 0; }
.room-bridge-notice button { display: grid; place-items: center; min-width: 44px; min-height: 44px; color: inherit; background: transparent; border: 0; cursor: pointer; }
</style>
