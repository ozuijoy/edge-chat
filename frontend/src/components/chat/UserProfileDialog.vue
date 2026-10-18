<script setup lang="ts">
import { computed, ref, toRef } from "vue";
import { X } from "@lucide/vue";
import type { ProfileIdentity, UserProfile } from "../../../../shared/user-profile.ts";
import { useOverlayLifecycle } from "../../composables/useOverlayLifecycle.js";
import { t } from "../../i18n.js";
import UiAvatar from "../ui/Avatar.vue";
import UiButton from "../ui/Button.vue";

const props = defineProps<{
  show: boolean;
  identity: ProfileIdentity | null;
  profile: UserProfile | null;
  loading: boolean;
  unavailable: boolean;
  error: string;
  submitting: boolean;
  isSelf: boolean;
  restoreFocus: boolean;
}>();
const emit = defineEmits(["close", "retry", "send-message", "edit"]);
const panel = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const displayed = computed(() => props.profile || props.identity);
const external = computed(() => props.identity?.kind === "external");
useOverlayLifecycle({
  open: toRef(props, "show"),
  onClose: () => emit("close"),
  focusTarget: closeButton,
  container: panel,
  restoreFocus: toRef(props, "restoreFocus"),
});
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="user-profile-overlay" @click.self="emit('close')">
      <section ref="panel" class="user-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="user-profile-title" tabindex="-1">
        <header class="user-profile-dialog__header">
          <h2 id="user-profile-title">{{ t('profile.title') }}</h2>
          <button ref="closeButton" type="button" class="user-profile-dialog__close" :aria-label="t('common.close')" @click="emit('close')">
            <X :size="20" aria-hidden="true" />
          </button>
        </header>
        <div class="user-profile-dialog__identity">
          <UiAvatar :src="displayed?.avatarUrl" :fallback="displayed?.displayName" size="lg" />
          <h3>{{ displayed?.displayName }}</h3>
          <p v-if="!external && displayed && 'username' in displayed && displayed.username">@{{ displayed.username }}</p>
          <span class="user-profile-dialog__source">{{ external ? (identity?.kind === 'external' && identity.source === 'telegram' ? 'Telegram' : t('profile.external')) : t('profile.local') }}</span>
        </div>
        <p v-if="loading" role="status">{{ t('common.loading') }}</p>
        <p v-else-if="unavailable" role="status">{{ t('profile.unavailable') }}</p>
        <template v-else-if="external">
          <p class="user-profile-dialog__muted">{{ t('profile.externalHint') }}</p>
        </template>
        <template v-else-if="profile">
          <h4>{{ t('profile.bio') }}</h4>
          <p class="user-profile-dialog__bio" :class="{ 'user-profile-dialog__muted': !profile.bio }">{{ profile.bio || t('profile.empty') }}</p>
        </template>
        <p v-if="error && !unavailable" role="alert" class="user-profile-dialog__error">{{ error }}</p>
        <div class="user-profile-dialog__actions">
          <UiButton v-if="!external && !profile && !loading && !unavailable" variant="secondary" @click="emit('retry')">{{ t('profile.retry') }}</UiButton>
          <UiButton v-if="profile && !unavailable && isSelf" @click="emit('edit')">{{ t('profile.edit') }}</UiButton>
          <UiButton v-else-if="profile && !unavailable" :disabled="submitting" @click="emit('send-message')">{{ submitting ? t('common.opening') : t('profile.sendMessage') }}</UiButton>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.user-profile-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(11, 20, 26, 0.42);
}
.user-profile-dialog {
  width: min(100%, 400px);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 24px;
  border-radius: 20px;
  background: var(--color-background, #fff);
  color: var(--color-text, #111b21);
  box-shadow: 0 20px 60px rgba(11, 20, 26, 0.2);
  overflow-wrap: anywhere;
}
.user-profile-dialog__header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.user-profile-dialog__header h2 { margin: 0; font-size: 18px; }
.user-profile-dialog__close { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
.user-profile-dialog__close:hover { background: rgba(11, 20, 26, 0.06); }
.user-profile-dialog__identity { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 0 24px; text-align: center; }
.user-profile-dialog__identity h3 { margin: 4px 0 0; font-size: 22px; }
.user-profile-dialog__identity p { margin: 0; }
.user-profile-dialog__source, .user-profile-dialog__muted { color: #54656f; }
.user-profile-dialog__source { font-size: 12px; }
.user-profile-dialog h4 { margin: 0 0 8px; font-size: 14px; }
.user-profile-dialog__bio { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; margin: 0; }
.user-profile-dialog__error { color: #b42318; }
.user-profile-dialog__actions { display: flex; justify-content: stretch; margin-top: 24px; }
.user-profile-dialog__actions > * { flex: 1; min-height: 44px; }
.user-profile-dialog button:focus-visible { outline: 2px solid var(--site-brand, #008069); outline-offset: 3px; }
@media (max-width: 640px) {
  .user-profile-overlay { align-items: flex-end; padding: 0; }
  .user-profile-dialog { width: 100%; max-height: calc(100dvh - env(safe-area-inset-top) - 16px); border-radius: 20px 20px 0 0; padding: 20px 24px calc(24px + env(safe-area-inset-bottom)); }
}
</style>
