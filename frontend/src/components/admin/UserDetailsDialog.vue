<script setup>
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue';
import { ChevronRight, RefreshCw, X } from '@lucide/vue';
import api from '../../api.js';
import { describeUserAgent } from '../../admin/user-agent.ts';
import { useOverlayLifecycle } from '../../composables/useOverlayLifecycle.js';
import { formatDateTime, t } from '../../i18n.js';
import '../../styles/admin/user-details-dialog.css';

const props = defineProps({ show: Boolean, user: Object });
const emit = defineEmits(['close']);
const closeButton = ref(null);
const details = ref(null);
const loading = ref(false);
const error = ref('');
const historyOpen = ref(false);
let controller;
let generation = 0;
function loginFields(info, includeTime = true) {
  const missing = t('users.details.unavailable');
  const client = describeUserAgent(info.userAgent || '');
  return [
    ...(includeTime ? [['loggedInAt', formatDateTime(info.loginAt)]] : []),
    ['ip', info.ip || missing], ['webrtcIps', info.webrtcIps?.join(', ') || missing],
    ['webrtcCheckedAt', info.webrtcCheckedAt ? formatDateTime(info.webrtcCheckedAt) : missing],
    ['browser', client.browser || missing], ['system', client.system || missing],
    ['model', client.model || missing], ['userAgent', info.userAgent || missing],
  ];
}
const history = computed(() => historyOpen.value
  ? (details.value?.loginHistory || []).slice(1).map((record) => ({ ...record, fields: loginFields(record, false) }))
  : []);
const fields = computed(() => {
  const user = details.value;
  if (!user) return [];
  const info = user.loginHistory[0];
  const missing = t('users.details.unavailable');
  const time = (value) => value ? formatDateTime(value) : missing;
  return [
    ['id', user.id], ['role', t(user.isAdmin ? 'users.details.admin' : 'users.details.member')],
    ['createdAt', time(user.createdAt)], ['bio', user.bio || missing],
    ...(info ? loginFields(info) : []),
  ];
});

function cancel() {
  generation += 1;
  controller?.abort();
}

async function load() {
  cancel();
  const current = generation;
  controller = new AbortController();
  loading.value = true;
  error.value = '';
  details.value = null;
  historyOpen.value = false;
  try {
    const payload = await api.adminUserDetails(props.user.id, { signal: controller.signal });
    if (current === generation) details.value = payload.user;
  } catch (cause) {
    if (current === generation) error.value = cause.message;
  } finally {
    if (current === generation) loading.value = false;
  }
}

watch(() => [props.show, props.user?.id], ([show]) => {
  if (show) void load();
  else cancel();
}, { immediate: true });
onBeforeUnmount(cancel);
useOverlayLifecycle({ open: toRef(props, 'show'), onClose: () => emit('close'), focusTarget: closeButton });
</script>

<template>
  <Teleport to="body">
    <Transition name="user-details">
      <section v-if="show" class="user-details__overlay" @click.self="emit('close')">
        <div class="user-details" role="dialog" aria-modal="true" aria-labelledby="user-details-title" :aria-busy="loading">
          <header class="user-details__header">
            <div>
              <h2 id="user-details-title">{{ t('users.details.title') }}</h2>
              <p>{{ user?.displayName }} <span>@{{ user?.username }}</span></p>
            </div>
            <button type="button" ref="closeButton" class="user-details__icon" :title="t('common.close')" :aria-label="t('common.close')" @click="emit('close')"><X aria-hidden="true" /></button>
          </header>
          <p v-if="loading" class="user-details__state" role="status">{{ t('users.loading') }}</p>
          <div v-else-if="error" class="user-details__state" role="alert">
            <p class="error-text">{{ error }}</p>
            <button type="button" class="user-details__icon" :title="t('users.refresh')" :aria-label="t('users.refresh')" @click="load"><RefreshCw aria-hidden="true" /></button>
          </div>
          <template v-else-if="details">
            <p v-if="!details.loginHistory.length" class="user-details__notice">{{ t('users.details.noLogins') }}</p>
            <dl class="user-details__fields">
              <div v-for="[key, value] in fields" :key="key">
                <dt>{{ t(`users.details.${key}`) }}</dt><dd>{{ value }}</dd>
              </div>
            </dl>
            <details v-if="details.loginHistory.length > 1" class="user-details__history" @toggle="historyOpen = $event.target.open">
              <summary><ChevronRight aria-hidden="true" /><span>{{ t('users.details.history', { count: details.loginHistory.length - 1 }) }}</span></summary>
              <section v-for="record in history" :key="record.id" class="user-details__record">
                <h3><time :datetime="record.loginAt">{{ formatDateTime(record.loginAt) }}</time></h3>
                <dl class="user-details__fields">
                  <div v-for="[key, value] in record.fields" :key="key">
                    <dt>{{ t(`users.details.${key}`) }}</dt><dd>{{ value }}</dd>
                  </div>
                </dl>
              </section>
            </details>
          </template>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>
