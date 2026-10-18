<script setup>
import { KeyRound, RefreshCw, Save, Trash2 } from '@lucide/vue';
import { onMounted, reactive, ref } from 'vue';
import api from '../api.js';
import UiButton from '../components/ui/Button.vue';
import UiSurface from '../components/ui/Surface.vue';
import { t } from '../i18n.js';
import { can } from '../authorization.ts';
import store from '../store.js';

const loading = ref(false);
const savingConfig = ref(false);
const savingMapping = ref(false);
const error = ref('');
const success = ref('');
const state = ref({ config: {}, channels: [], mappings: [] });
const configForm = reactive({ botToken: '' });
const mappingForm = reactive({ channelId: '', telegramChatId: '' });

function applyState(payload) {
  state.value = payload;
}

async function loadState() {
  loading.value = true;
  error.value = '';
  try {
    applyState(await api.adminTelegram());
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}

async function saveConfig() {
  savingConfig.value = true;
  error.value = '';
  success.value = '';
  try {
    applyState(await api.saveAdminTelegramConfig(configForm));
    configForm.botToken = '';
    success.value = t('telegram.botConnected');
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    savingConfig.value = false;
  }
}

async function createMapping() {
  savingMapping.value = true;
  error.value = '';
  success.value = '';
  try {
    applyState(await api.createAdminTelegramMapping(mappingForm));
    mappingForm.telegramChatId = '';
    success.value = t('telegram.mappingSaved');
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    savingMapping.value = false;
  }
}

async function toggleMapping(mapping) {
  error.value = '';
  try {
    applyState(await api.updateAdminTelegramMapping(mapping.id, { enabled: !mapping.enabled }));
  } catch (currentError) {
    error.value = currentError.message;
  }
}

async function removeMapping(mapping) {
  if (!window.confirm(t('telegram.confirmDeleteMapping', { name: mapping.channelName }))) return;
  error.value = '';
  try {
    applyState(await api.deleteAdminTelegramMapping(mapping.id));
  } catch (currentError) {
    error.value = currentError.message;
  }
}

onMounted(loadState);
</script>

<template>
  <div class="admin-section admin-telegram-page">
    <header class="admin-section__header">
      <div class="admin-section__heading">
        <h2>{{ t('telegram.title') }}</h2>
        <p>{{ t('telegram.description') }}</p>
      </div>
      <UiButton variant="secondary" :disabled="loading" @click="loadState">
        <RefreshCw :size="16" aria-hidden="true" :class="{ 'admin-spin': loading }" />
        {{ t('common.refresh') }}
      </UiButton>
    </header>

    <div class="admin-section__body">
      <p v-if="error" class="error-text">{{ error }}</p>
      <p v-if="success" class="success-text">{{ success }}</p>

      <UiSurface class="panel telegram-config-panel">
        <div class="telegram-panel-heading">
          <div>
            <h3 class="panel-title">{{ t('telegram.botConnection') }}</h3>
            <p class="muted">
              {{ state.config.configured ? t('telegram.connectedAs', { username: state.config.botUsername }) : t('telegram.notConnected') }}
            </p>
          </div>
          <span class="telegram-status" :class="{ 'telegram-status--online': state.config.configured }">
            {{ state.config.configured ? t('telegram.configured') : t('telegram.notConfigured') }}
          </span>
        </div>
        <form v-if="store.session?.isSuperAdmin" class="telegram-config-form" @submit.prevent="saveConfig">
          <label class="field telegram-token-field">
            <span>{{ t('telegram.botToken') }}</span>
            <input v-model.trim="configForm.botToken" type="password" autocomplete="off" placeholder="123456789:AA..." />
          </label>
          <UiButton type="submit" :disabled="savingConfig || !configForm.botToken">
            <KeyRound v-if="!state.config.configured" :size="16" />
            <Save v-else :size="16" />
            {{ savingConfig ? t('telegram.connecting') : state.config.configured ? t('telegram.updateToken') : t('telegram.connectBot') }}
          </UiButton>
        </form>
        <div v-if="state.config.webhookUrl" class="telegram-webhook-row">
          <span>Webhook</span>
          <code>{{ state.config.webhookUrl }}</code>
        </div>
      </UiSurface>

      <UiSurface class="panel panel--table">
        <div class="telegram-panel-heading">
          <div>
            <h3 class="panel-title">{{ t('telegram.groupMappings') }}</h3>
            <p class="muted">{{ t('telegram.mappingCount', { count: state.mappings.length }) }}</p>
          </div>
        </div>
        <form v-if="can('telegram.mappings.manage')" class="telegram-mapping-form" @submit.prevent="createMapping">
          <label class="field">
            <span>{{ t('telegram.edgechatGroup') }}</span>
            <select v-model="mappingForm.channelId" required>
              <option disabled value="">{{ t('telegram.selectGroup') }}</option>
              <option v-for="channel in state.channels" :key="channel.id" :value="channel.id">
                {{ channel.name }} ({{ t(channel.kind === 'private' ? 'chat.privateGroup' : 'chat.publicGroup') }})
              </option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('telegram.chatId') }}</span>
            <input v-model.trim="mappingForm.telegramChatId" required placeholder="-1001234567890" />
          </label>
          <UiButton type="submit" :disabled="savingMapping || !state.config.configured">
            <Save :size="16" />
            {{ savingMapping ? t('common.saving') : t('telegram.saveMapping') }}
          </UiButton>
        </form>

        <div class="admin-table-wrap">
          <table class="list-table telegram-mapping-table">
            <thead>
              <tr><th>EdgeChat</th><th>Telegram</th><th>{{ t('telegram.sync') }}</th><th>{{ t('telegram.actions') }}</th></tr>
            </thead>
            <tbody>
              <tr v-if="loading && !state.mappings.length"><td colspan="4" class="muted">{{ t('telegram.loadingMappings') }}</td></tr>
              <tr v-else-if="!state.mappings.length"><td colspan="4" class="muted">{{ t('telegram.emptyMappings') }}</td></tr>
              <tr v-for="mapping in state.mappings" :key="mapping.id">
                <td>
                  <strong>{{ mapping.channelName }}</strong>
                  <div class="muted">{{ t(mapping.channelKind === 'private' ? 'chat.privateGroup' : 'chat.publicGroup') }}</div>
                </td>
                <td>
                  <strong>{{ mapping.telegramChatTitle || t('telegram.unnamedChat') }}</strong>
                  <div class="muted telegram-chat-id">{{ mapping.telegramChatId }}</div>
                </td>
                <td>
                  <label class="telegram-switch">
                    <input type="checkbox" :disabled="!can('telegram.mappings.manage')" :checked="mapping.enabled" @change="toggleMapping(mapping)" />
                    <span aria-hidden="true"></span>
                    <span class="telegram-switch__label">{{ mapping.enabled ? t('common.enabled') : t('common.paused') }}</span>
                  </label>
                </td>
                <td>
                  <button v-if="can('telegram.mappings.manage')" type="button" class="admin-icon-button" :title="t('telegram.deleteMapping')" :aria-label="t('telegram.deleteMapping')" @click="removeMapping(mapping)">
                    <Trash2 :size="16" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiSurface>
    </div>
  </div>
</template>

<style scoped src="../styles/admin/telegram.css"></style>
