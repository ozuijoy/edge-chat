<script setup lang="ts">
import {
  AtSign,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Save,
  Send,
  Unplug
} from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import api from '../../api.js';
import { useI18n } from '../../i18n.js';
import { isDemoMode } from '../../runtime.js';
import UiBadge from '../ui/Badge.vue';
import UiButton from '../ui/Button.vue';

type TelegramNotificationState = {
  available: boolean;
  connected?: boolean;
  telegramName?: string;
  dmEnabled?: boolean;
  mentionEnabled?: boolean;
};

const { t } = useI18n();
const telegramNotifications = ref<TelegramNotificationState | null>(null);
const telegramLink = ref('');
const loading = ref(true);
const refreshing = ref(false);
const telegramBusy = ref(false);
const notice = ref('');
const noticeTone = ref<'info' | 'error'>('info');
let telegramPoll: ReturnType<typeof setInterval> | null = null;
let telegramPollCount = 0;

const status = computed(() => {
  if (loading.value) return { label: t('settings.telegramStatusLoading'), variant: 'secondary' };
  if (!telegramNotifications.value?.available) {
    return { label: t('settings.telegramStatusUnavailable'), variant: 'secondary' };
  }
  if (telegramNotifications.value.connected) {
    return { label: t('settings.telegramStatusConnected'), variant: 'success' };
  }
  if (telegramLink.value) {
    return { label: t('settings.telegramStatusWaiting'), variant: 'warm' };
  }
  return { label: t('settings.telegramStatusDisconnected'), variant: 'secondary' };
});

function setNotice(message = '', tone: 'info' | 'error' = 'info') {
  notice.value = message;
  noticeTone.value = tone;
}

function stopPolling() {
  if (telegramPoll) clearInterval(telegramPoll);
  telegramPoll = null;
}

async function loadTelegramNotifications() {
  try {
    const wasWaiting = Boolean(telegramLink.value);
    telegramNotifications.value = await api.telegramNotifications();
    if (telegramNotifications.value.connected) {
      telegramLink.value = '';
      stopPolling();
      if (wasWaiting) setNotice(t('settings.telegramConnectedSuccess'));
    }
  } catch (currentError) {
    setNotice(currentError instanceof Error ? currentError.message : String(currentError), 'error');
  } finally {
    loading.value = false;
  }
}

async function refreshTelegramNotifications() {
  refreshing.value = true;
  await loadTelegramNotifications();
  refreshing.value = false;
}

function startPolling() {
  stopPolling();
  telegramPollCount = 0;
  telegramPoll = setInterval(() => {
    telegramPollCount += 1;
    if (telegramPollCount >= 120) {
      stopPolling();
      telegramLink.value = '';
      setNotice(t('settings.telegramLinkExpired'), 'error');
      return;
    }
    void loadTelegramNotifications();
  }, 5000);
}

async function connectTelegram() {
  setNotice();
  telegramBusy.value = true;
  try {
    telegramLink.value = (await api.createTelegramNotificationLink()).url;
    startPolling();
    setNotice(t('settings.telegramOpenLink'));
  } catch (currentError) {
    setNotice(currentError instanceof Error ? currentError.message : String(currentError), 'error');
  } finally {
    telegramBusy.value = false;
  }
}

async function saveTelegramNotifications() {
  if (!telegramNotifications.value || telegramBusy.value) return;
  setNotice();
  telegramBusy.value = true;
  try {
    telegramNotifications.value = await api.updateTelegramNotifications({
      dmEnabled: Boolean(telegramNotifications.value.dmEnabled),
      mentionEnabled: Boolean(telegramNotifications.value.mentionEnabled)
    });
    setNotice(t('settings.telegramSaved'));
  } catch (currentError) {
    setNotice(currentError instanceof Error ? currentError.message : String(currentError), 'error');
  } finally {
    telegramBusy.value = false;
  }
}

async function disconnectTelegram() {
  setNotice();
  telegramBusy.value = true;
  try {
    await api.disconnectTelegramNotifications();
    telegramLink.value = '';
    stopPolling();
    await loadTelegramNotifications();
    setNotice(t('settings.telegramDisconnected'));
  } catch (currentError) {
    setNotice(currentError instanceof Error ? currentError.message : String(currentError), 'error');
  } finally {
    telegramBusy.value = false;
  }
}

onMounted(() => {
  if (isDemoMode) {
    telegramNotifications.value = { available: false };
    loading.value = false;
    return;
  }
  void loadTelegramNotifications();
});

onBeforeUnmount(stopPolling);
</script>

<template>
  <section class="telegram-settings">
    <header class="telegram-heading">
      <div class="telegram-heading__title">
        <span class="telegram-heading__icon" aria-hidden="true"><Send :size="17" /></span>
        <h2>{{ t('settings.telegramTitle') }}</h2>
      </div>
      <UiBadge :variant="status.variant">{{ status.label }}</UiBadge>
    </header>

    <p class="telegram-description">{{ t('settings.telegramDescription') }}</p>

    <div v-if="loading" class="telegram-loading" role="status">
      <LoaderCircle :size="18" aria-hidden="true" />
      <span>{{ t('settings.telegramStatusLoading') }}</span>
    </div>

    <template v-else-if="telegramNotifications?.available">
      <template v-if="telegramNotifications.connected">
        <p class="telegram-identity">
          <CheckCircle2 :size="17" aria-hidden="true" />
          <span>{{ t('settings.telegramConnected', { name: telegramNotifications.telegramName }) }}</span>
        </p>

        <div class="telegram-preferences">
          <label class="telegram-preference">
            <span class="telegram-preference__label">
              <MessageCircle :size="18" aria-hidden="true" />
              {{ t('settings.telegramDm') }}
            </span>
            <span class="telegram-switch">
              <input
                v-model="telegramNotifications.dmEnabled"
                type="checkbox"
                :disabled="telegramBusy"
              />
              <span aria-hidden="true"></span>
            </span>
          </label>
          <label class="telegram-preference">
            <span class="telegram-preference__label">
              <AtSign :size="18" aria-hidden="true" />
              {{ t('settings.telegramMention') }}
            </span>
            <span class="telegram-switch">
              <input
                v-model="telegramNotifications.mentionEnabled"
                type="checkbox"
                :disabled="telegramBusy"
              />
              <span aria-hidden="true"></span>
            </span>
          </label>
        </div>

        <div class="telegram-actions">
          <UiButton size="sm" :disabled="telegramBusy" @click="saveTelegramNotifications">
            <Save :size="16" aria-hidden="true" />
            {{ telegramBusy ? t('common.saving') : t('common.save') }}
          </UiButton>
          <UiButton
            class="telegram-disconnect"
            variant="destructive"
            size="sm"
            :disabled="telegramBusy"
            @click="disconnectTelegram"
          >
            <Unplug :size="16" aria-hidden="true" />
            {{ t('settings.telegramDisconnect') }}
          </UiButton>
        </div>
      </template>

      <template v-else-if="telegramLink">
        <div class="telegram-waiting" role="status">
          <LoaderCircle :size="18" aria-hidden="true" />
          <span>{{ t('settings.telegramStatusWaiting') }}</span>
        </div>
        <div class="telegram-actions">
          <a
            class="ui-button ui-button--default ui-button--sm telegram-open-link"
            :href="telegramLink"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink :size="16" aria-hidden="true" />
            {{ t('settings.telegramOpen') }}
          </a>
          <UiButton
            variant="secondary"
            size="sm"
            :disabled="refreshing"
            @click="refreshTelegramNotifications"
          >
            <RefreshCw :size="16" aria-hidden="true" :class="{ 'telegram-spin': refreshing }" />
            {{ t('settings.telegramRefresh') }}
          </UiButton>
        </div>
      </template>

      <UiButton v-else class="telegram-connect" :disabled="telegramBusy" @click="connectTelegram">
        <Send :size="17" aria-hidden="true" />
        {{ telegramBusy ? t('common.processing') : t('settings.telegramConnect') }}
      </UiButton>
    </template>

    <p v-else class="telegram-unavailable">
      {{ t(isDemoMode ? 'settings.telegramDemo' : 'settings.telegramUnavailable') }}
    </p>

    <p
      v-if="notice"
      class="telegram-notice"
      :class="`telegram-notice--${noticeTone}`"
      :role="noticeTone === 'error' ? 'alert' : 'status'"
    >
      {{ notice }}
    </p>
  </section>
</template>

<style scoped>
.telegram-settings {
  min-width: 0;
}

.telegram-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(91, 141, 191, 0.08);
}

.telegram-heading__title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}

.telegram-heading__title h2 {
  margin: 0;
  color: #2c4a6e;
  font-size: 14px;
  font-weight: 700;
}

.telegram-heading__icon {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: rgba(34, 158, 217, 0.11);
  color: #1679a8;
}

.telegram-description,
.telegram-unavailable,
.telegram-notice {
  margin: 0;
  color: #6b7c93;
  font-size: 13px;
  line-height: 1.6;
}

.telegram-loading,
.telegram-waiting,
.telegram-identity {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0;
  color: #52708f;
  font-size: 13px;
  font-weight: 600;
}

.telegram-identity {
  color: #217a5b;
}

.telegram-loading svg,
.telegram-waiting svg {
  animation: telegramSpin 1s linear infinite;
}

.telegram-preferences {
  border-block: 1px solid rgba(91, 141, 191, 0.09);
}

.telegram-preference {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: #2c4a6e;
  cursor: pointer;
}

.telegram-preference + .telegram-preference {
  border-top: 1px solid rgba(91, 141, 191, 0.07);
}

.telegram-preference__label {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  font-weight: 600;
}

.telegram-preference__label svg {
  flex: 0 0 auto;
  color: #6b8aab;
}

.telegram-switch {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}

.telegram-switch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.telegram-switch > span {
  position: relative;
  width: 38px;
  height: 22px;
  border: 1px solid rgba(91, 141, 191, 0.2);
  border-radius: 999px;
  background: rgba(107, 124, 147, 0.16);
  transition: background-color 160ms ease, border-color 160ms ease;
}

.telegram-switch > span::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(44, 74, 110, 0.22);
  transition: transform 160ms ease;
}

.telegram-switch input:checked + span {
  border-color: rgba(34, 158, 217, 0.72);
  background: #229ed9;
}

.telegram-switch input:checked + span::after {
  transform: translateX(16px);
}

.telegram-switch input:focus-visible + span {
  outline: 3px solid rgba(34, 158, 217, 0.2);
  outline-offset: 2px;
}

.telegram-switch input:disabled + span {
  cursor: not-allowed;
  opacity: 0.55;
}

.telegram-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.telegram-open-link {
  text-decoration: none;
}

.telegram-open-link:focus-visible,
.ui-button:focus-visible {
  outline: 3px solid rgba(34, 158, 217, 0.2);
  outline-offset: 2px;
}

.telegram-connect.ui-button {
  width: fit-content;
}

.telegram-disconnect.ui-button {
  border-color: rgba(179, 74, 87, 0.2);
  background: transparent;
  color: #a13f4d;
}

.telegram-disconnect.ui-button:hover:not(:disabled) {
  border-color: rgba(179, 74, 87, 0.32);
  background: rgba(179, 74, 87, 0.08);
}

.telegram-notice {
  padding-top: 10px;
  border-top: 1px solid rgba(91, 141, 191, 0.08);
}

.telegram-notice--info {
  color: #52708f;
}

.telegram-notice--error {
  color: #a13f4d;
}

.telegram-spin {
  animation: telegramSpin 1s linear infinite;
}

@keyframes telegramSpin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 420px) {
  .telegram-heading {
    align-items: flex-start;
  }

  .telegram-heading .ui-badge {
    padding-inline: 9px;
  }

  .telegram-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .telegram-actions > *,
  .telegram-connect.ui-button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .telegram-loading svg,
  .telegram-waiting svg,
  .telegram-spin {
    animation: none;
  }
}
</style>
