<script setup>
import { computed, onMounted, ref } from 'vue';
import { Link2, RefreshCw, Copy, ShieldCheck } from '@lucide/vue';
import api from '../api.js';
import UiButton from '../components/ui/Button.vue';
import UiSurface from '../components/ui/Surface.vue';
import { t } from '../i18n.js';
import { isDemoMode } from '../runtime.js';
import { can } from '../authorization.ts';

const state = ref({ channels: [], bindings: [], instance: null });
const busy = ref(false);
const error = ref('');
const copied = ref(false);
const channelId = ref('');
const invitation = ref('');
const generated = ref(null);
const consent = ref(false);
const mode = ref('create');
const invitePeer = computed(() => {
  try {
    const value = JSON.parse(invitation.value);
    return value?.endpoint && typeof value.endpoint.origin === 'string' && typeof value.endpoint.channelName === 'string'
      ? value.endpoint : null;
  } catch { return null; }
});
function selectMode(value) { mode.value = value; consent.value = false; }
const available = computed(() => state.value.channels.filter((c) =>
  !state.value.bindings.some((b) => b.channelId === c.id && b.status !== 'revoked')));

async function perform(operation) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try { await operation(); } catch (e) {
    const code = e?.payload?.error?.code;
    error.value = code ? errorLabel(code) : e.message;
  } finally { busy.value = false; }
}
async function load() { state.value = await api.instanceBridge(); }
async function submit() {
  await perform(async () => {
    if (mode.value === 'create') {
      generated.value = await api.instanceBridge('/invitations', { channelId: Number(channelId.value) });
      copied.value = false;
    } else {
      await api.instanceBridge('/accept', { channelId: Number(channelId.value), invitation: invitation.value });
      invitation.value = '';
    }
    consent.value = false;
    channelId.value = '';
    await load();
  });
}
async function action(binding, name) {
  const confirmation = name === 'confirm'
    ? t('bridge.confirmConsent', { origin: binding.peerOrigin, group: binding.peerChannelName })
    : name === 'pause' ? t('bridge.pauseConsent') : name === 'unlink' ? t('bridge.unlinkConsent') : '';
  if (confirmation && !window.confirm(confirmation)) return;
  await perform(async () => {
    state.value = await api.instanceBridge(`/${binding.id}/actions`, { action: name });
    if (name === 'unlink' && generated.value?.id === binding.id) generated.value = null;
  });
}
async function copyInvite() {
  await perform(async () => {
    await navigator.clipboard.writeText(generated.value.invitation);
    copied.value = true;
  });
}
function errorLabel(code) {
  const key = `bridge.error.${code}`;
  const translated = t(key);
  return translated === key ? t('bridge.error.generic') : translated;
}
onMounted(() => perform(load));
</script>

<template>
  <div class="admin-section bridge-page">
    <header class="admin-section__header">
      <div class="admin-section__heading">
        <h2>{{ t('bridge.title') }}</h2>
        <p>{{ t('bridge.description') }}</p>
      </div>
      <UiButton variant="secondary" :disabled="busy" @click="perform(load)">
        <RefreshCw :size="16" aria-hidden="true" />{{ t('bridge.refresh') }}
      </UiButton>
    </header>
    <div class="admin-section__body">
      <p v-if="error" role="alert" class="error-text">{{ error }}</p>
      <p v-if="isDemoMode" class="muted">{{ t('bridge.demoHint') }}</p>
      <UiSurface class="panel bridge-scope">
        <ShieldCheck :size="21" aria-hidden="true" />
        <div><strong>{{ t('bridge.scope') }}</strong><p class="muted">{{ t('bridge.boundary') }}</p></div>
      </UiSurface>

      <UiSurface v-if="can('instance_bridge.manage')" class="panel">
        <div class="bridge-mode">
          <UiButton :variant="mode === 'create' ? 'primary' : 'secondary'" :disabled="busy" @click="selectMode('create')">{{ t('bridge.createInvite') }}</UiButton>
          <UiButton :variant="mode === 'accept' ? 'primary' : 'secondary'" :disabled="busy" @click="selectMode('accept')">{{ t('bridge.acceptInvite') }}</UiButton>
        </div>
        <form class="bridge-form" @submit.prevent="submit">
          <label class="field">
            <span>{{ t('bridge.localGroup') }}</span>
            <select v-model="channelId" required :disabled="busy">
              <option disabled value="">{{ t('bridge.selectGroup') }}</option>
              <option v-for="channel in available" :key="channel.id" :value="channel.id">
                {{ channel.name }} · {{ t(channel.kind === 'private' ? 'chat.privateGroup' : 'chat.publicGroup') }}
              </option>
            </select>
          </label>
          <label v-if="mode === 'accept'" class="field">
            <span>{{ t('bridge.invitation') }}</span>
            <textarea v-model.trim="invitation" rows="4" required autocomplete="off" spellcheck="false" :disabled="busy" />
          </label>
          <p v-if="mode === 'accept' && invitePeer" class="bridge-peer">
            <strong>{{ t('bridge.remote') }}: {{ invitePeer.channelName }}</strong><br />{{ invitePeer.origin }}
          </p>
          <label class="bridge-consent">
            <input v-model="consent" type="checkbox" required :disabled="busy" />
            <span>{{ t(mode === 'accept' ? 'bridge.claimConsent' : 'bridge.createConsent') }}</span>
          </label>
          <UiButton type="submit" :disabled="busy || !consent || !channelId">
            <Link2 :size="16" aria-hidden="true" />
            {{ t(busy ? 'bridge.working' : mode === 'accept' ? 'bridge.acceptInvite' : 'bridge.createInvite') }}
          </UiButton>
        </form>
        <div v-if="generated" class="bridge-invitation" role="status">
          <strong>{{ t('bridge.inviteSecretHint') }}</strong>
          <p class="muted">{{ t('bridge.inviteExpires', { time: new Date(generated.expiresAt).toLocaleTimeString() }) }}</p>
          <label class="field"><span>{{ t('bridge.invitation') }}</span><textarea readonly :value="generated.invitation" rows="4" spellcheck="false" /></label>
          <UiButton variant="secondary" :disabled="busy" @click="copyInvite"><Copy :size="16" aria-hidden="true" />{{ t(copied ? 'bridge.copied' : 'bridge.copy') }}</UiButton>
        </div>
      </UiSurface>

      <section class="bridge-bindings" :aria-label="t('bridge.bindings')" :aria-busy="busy">
        <h3 class="panel-title">{{ t('bridge.bindings') }}</h3>
        <p v-if="!state.bindings.length" class="muted">{{ t(busy ? 'bridge.loading' : 'bridge.empty') }}</p>
        <UiSurface v-for="binding in state.bindings" :key="binding.id" class="panel bridge-binding">
          <div class="bridge-binding__heading">
            <div>
              <h3>{{ binding.channelName }}</h3>
              <p v-if="binding.peerOrigin" class="bridge-peer">{{ binding.peerChannelName }}<br /><span class="muted">{{ binding.peerOrigin }}</span></p>
              <p v-else class="muted">{{ t('bridge.peerWaiting') }}</p>
            </div>
            <span class="bridge-status">{{ t(`bridge.status.${binding.status}`) }}</span>
          </div>
          <p v-if="binding.localPaused || binding.peerPaused" class="bridge-status">
            {{ binding.localPaused ? t('bridge.localPaused') : '' }} {{ binding.peerPaused ? t('bridge.peerPaused') : '' }}
          </p>
          <p v-if="binding.controlPending" class="muted">{{ t('bridge.controlPending') }}</p>
          <p v-if="binding.lastError" class="error-text">{{ errorLabel(binding.lastError) }}</p>
          <div class="bridge-counters">
            <span>{{ t('bridge.queued', { count: binding.queued }) }}</span>
            <span>{{ t('bridge.delivered', { count: binding.delivered }) }}</span>
            <span>{{ t('bridge.discarded', { count: binding.discarded }) }}</span>
          </div>
          <div v-if="can('instance_bridge.manage')" class="bridge-actions">
            <UiButton v-if="binding.status === 'pending' && binding.role === 'inviter'" :disabled="busy" @click="action(binding, 'confirm')">{{ t('bridge.confirm') }}</UiButton>
            <UiButton v-if="binding.status === 'active'" variant="secondary" :disabled="busy" @click="action(binding, binding.localPaused ? 'resume' : 'pause')">{{ t(binding.localPaused ? 'bridge.resume' : 'bridge.pause') }}</UiButton>
            <UiButton v-if="binding.lastError && (binding.queued || binding.controlPending)" variant="secondary" :disabled="busy" @click="action(binding, 'retry')">{{ t('bridge.retry') }}</UiButton>
            <UiButton v-if="binding.status !== 'revoked'" variant="danger" :disabled="busy" @click="action(binding, 'unlink')">{{ t('bridge.unlink') }}</UiButton>
          </div>
        </UiSurface>
      </section>
    </div>
  </div>
</template>

<style scoped>
.bridge-scope, .bridge-mode, .bridge-actions, .bridge-counters, .bridge-binding__heading { display: flex; gap: 12px; }
.bridge-scope { align-items: flex-start; }
.bridge-scope > svg { flex-shrink: 0; }
.bridge-mode, .bridge-actions, .bridge-counters { flex-wrap: wrap; }
.bridge-form, .bridge-bindings { display: grid; gap: 20px; }
.bridge-form { margin-top: 24px; }
.bridge-consent { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; line-height: 1.6; cursor: pointer; }
.bridge-consent input { margin-top: 6px; width: 18px; height: 18px; flex-shrink: 0; }
.bridge-form > button { justify-self: start; }
.bridge-invitation { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-color); }
.bridge-invitation .field { margin-block: 12px; }
.bridge-page textarea { width: 100%; resize: vertical; overflow-wrap: anywhere; font: inherit; }
.bridge-binding__heading { justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
.bridge-binding h3 { margin: 0; }
.bridge-peer, .bridge-invitation, .bridge-status { overflow-wrap: anywhere; }
.bridge-status { font-size: 13px; font-weight: 600; }
.bridge-counters { margin-block: 16px; font-size: 13px; color: var(--text-secondary); }
.bridge-actions > *, .bridge-mode > * { min-height: 44px; }
</style>
