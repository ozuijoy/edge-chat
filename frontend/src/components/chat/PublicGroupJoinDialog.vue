<script setup>
import { Globe2, UserPlus, X } from '@lucide/vue';
import { ref, toRef } from 'vue';
import { useOverlayLifecycle } from '../../composables/useOverlayLifecycle.js';
import { t } from '../../i18n.js';
import UiAvatar from '../ui/Avatar.vue';

const props = defineProps({
  show: { type: Boolean, default: false },
  channel: { type: Object, default: null },
  joining: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'join']);
const joinButtonEl = ref(null);

useOverlayLifecycle({
  open: toRef(props, 'show'),
  onClose: () => {
    if (!props.joining) emit('close');
  },
  focusTarget: joinButtonEl
});
</script>

<template>
  <Transition name="public-group-fade">
    <div v-if="show && channel" class="public-group-overlay" @click.self="!joining && emit('close')">
      <section class="public-group-dialog" role="dialog" aria-modal="true" aria-labelledby="public-group-title">
        <button
          type="button"
          class="public-group-dialog__close"
          :aria-label="t('common.close')"
          :disabled="joining"
          @click="emit('close')"
        >
          <X :size="20" aria-hidden="true" />
        </button>

        <UiAvatar :src="channel.avatarUrl" :fallback="channel.name?.[0] || t('publicGroups.fallback')" size="lg" />
        <div class="public-group-dialog__identity">
          <span class="public-group-dialog__kind"><Globe2 :size="15" aria-hidden="true" />{{ t('chat.publicGroup') }}</span>
          <h2 id="public-group-title">{{ channel.name }}</h2>
          <p v-if="channel.description">{{ channel.description }}</p>
        </div>

        <dl class="public-group-dialog__facts">
          <div>
            <dt>{{ t('chat.members') }}</dt>
            <dd>{{ t('publicGroups.peopleCount', { count: Number(channel.memberCount || 0) }) }}</dd>
          </div>
          <div>
            <dt>{{ t('publicGroups.owner') }}</dt>
            <dd>{{ channel.ownerDisplayName || t('common.unknown') }}</dd>
          </div>
        </dl>

        <div class="public-group-dialog__actions">
          <button type="button" class="public-group-dialog__secondary" :disabled="joining" @click="emit('close')">
            {{ t('common.cancel') }}
          </button>
          <button
            ref="joinButtonEl"
            type="button"
            class="public-group-dialog__primary"
            :disabled="joining"
            @click="emit('join')"
          >
            <UserPlus :size="18" aria-hidden="true" />
            {{ joining ? t('publicGroups.joining') : t('publicGroups.join') }}
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.public-group-overlay {
  position: fixed;
  inset: 0;
  z-index: 115;
  display: flex;
  align-items: center;
  justify-content: center;
  padding:
    max(16px, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
  background: rgba(11, 20, 26, 0.42);
}

.public-group-dialog {
  position: relative;
  display: grid;
  justify-items: center;
  width: min(400px, 100%);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 32px 28px 24px;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 20px 60px rgba(11, 20, 26, 0.18);
  text-align: center;
}

.public-group-dialog__close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #667781;
  cursor: pointer;
}

.public-group-dialog__close:hover {
  background: #f0f2f5;
  color: #111b21;
}

.public-group-dialog__identity {
  display: grid;
  justify-items: center;
  gap: 6px;
  margin-top: 16px;
}

.public-group-dialog__kind {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--site-brand, #008069);
  font-size: 12px;
  font-weight: 600;
}

.public-group-dialog h2 {
  max-width: 100%;
  margin: 0;
  overflow-wrap: anywhere;
  color: #111b21;
  font-size: 20px;
}

.public-group-dialog__identity p {
  margin: 0;
  color: #667781;
  font-size: 13px;
  line-height: 1.55;
}

.public-group-dialog__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
  margin: 24px 0 0;
  padding: 16px 0;
  border-top: 1px solid #eef1f3;
  border-bottom: 1px solid #eef1f3;
}

.public-group-dialog__facts div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.public-group-dialog__facts div + div {
  border-left: 1px solid #eef1f3;
}

.public-group-dialog__facts dt {
  color: #8696a0;
  font-size: 12px;
}

.public-group-dialog__facts dd {
  margin: 0;
  overflow: hidden;
  color: #111b21;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.public-group-dialog__actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  width: 100%;
  margin-top: 24px;
}

.public-group-dialog__secondary,
.public-group-dialog__primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
}

.public-group-dialog__secondary {
  border: 1px solid #dce2e5;
  background: #ffffff;
  color: #111b21;
}

.public-group-dialog__primary {
  border: 1px solid var(--site-brand, #008069);
  background: var(--site-brand, #008069);
  color: #ffffff;
}

.public-group-dialog button:disabled {
  cursor: wait;
  opacity: 0.58;
}

.public-group-dialog button:focus-visible {
  outline: 3px solid rgba(var(--site-brand-rgb, 0, 128, 105), 0.24);
  outline-offset: 2px;
}

.public-group-fade-enter-active {
  transition: opacity 200ms ease-out;
}

.public-group-fade-leave-active {
  transition: opacity 150ms ease-in;
}

.public-group-fade-enter-from,
.public-group-fade-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .public-group-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .public-group-dialog {
    width: 100%;
    max-height: calc(100dvh - env(safe-area-inset-top));
    padding: 28px 20px max(20px, env(safe-area-inset-bottom));
    border-radius: 16px 16px 0 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .public-group-fade-enter-active,
  .public-group-fade-leave-active {
    transition: none;
  }
}
</style>
