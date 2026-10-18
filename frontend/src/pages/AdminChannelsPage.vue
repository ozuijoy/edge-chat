<script setup>
import { onMounted, ref } from 'vue';
import { RefreshCw, Trash2 } from '@lucide/vue';
import api from '../api.js';
import UiButton from '../components/ui/Button.vue';
import { can } from '../authorization.ts';
import { formatDateTime, t } from '../i18n.js';
const channels = ref([]); const error = ref(''); const busy = ref(false);
async function load() { busy.value = true; error.value = ''; try { channels.value = (await api.adminChannels()).channels; } catch (e) { error.value = e.message; } finally { busy.value = false; } }
async function remove(channel) {
  if (!window.confirm(t('rbac.confirmChannelDelete', { name: channel.name }))) return;
  busy.value = true; error.value = '';
  try { await api.deleteChannel(channel.id); await load(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
onMounted(load);
</script>
<template><div class="admin-section"><header class="admin-section__header"><div class="admin-section__heading"><h2>{{ t('rbac.channels') }}</h2><p>{{ t('rbac.channelDescription') }}</p></div><UiButton variant="secondary" :disabled="busy" :title="t('common.refresh')" :aria-label="t('common.refresh')" @click="load"><RefreshCw :size="18" /></UiButton></header>
  <p v-if="error" class="error-text" role="alert">{{ error }}</p><div class="admin-table-wrap"><table class="list-table"><thead><tr><th>{{ t('rbac.name') }}</th><th>{{ t('rbac.members') }}</th><th>{{ t('users.columns.createdAt') }}</th><th>{{ t('users.columns.actions') }}</th></tr></thead><tbody><tr v-for="channel in channels" :key="channel.id"><td>{{ channel.name }}<div class="muted">{{ t(channel.kind === 'private' ? 'chat.privateGroup' : 'chat.publicGroup') }}</div></td><td>{{ channel.memberCount }}</td><td>{{ formatDateTime(channel.createdAt) }}</td><td><UiButton v-if="can('channels.delete') && channel.name !== 'general'" variant="destructive" :disabled="busy" :title="t('common.delete')" :aria-label="t('common.delete')" @click="remove(channel)"><Trash2 :size="17" /></UiButton></td></tr></tbody></table></div>
</div></template>
