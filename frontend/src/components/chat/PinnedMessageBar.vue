<script setup>
import { Pin, PinOff } from '@lucide/vue';
import { computed } from 'vue';
import { t } from '../../i18n.js';
import { messageMarkdownToPlainText } from '../../message-markdown.ts';

const props = defineProps({
  message: { type: Object, required: true },
  canUnpin: { type: Boolean, default: false }
});
const emit = defineEmits(['reveal', 'unpin']);

const preview = computed(() => {
  const content = messageMarkdownToPlainText(props.message?.content || '');
  if (content) return content;
  return props.message?.attachment?.name || t('attachments.fallback');
});
</script>

<template>
  <div class="pinned-message-bar">
    <button
      type="button"
      class="pinned-message-bar__content"
      :aria-label="t('messages.revealPinned')"
      @click="emit('reveal')"
    >
      <Pin :size="18" :stroke-width="1.8" aria-hidden="true" />
      <span class="pinned-message-bar__copy">
        <strong>{{ t('messages.pinned') }}</strong>
        <span>{{ message.sender.displayName }} · {{ preview }}</span>
      </span>
    </button>
    <button
      v-if="canUnpin"
      type="button"
      class="pinned-message-bar__unpin"
      :title="t('messages.unpin')"
      :aria-label="t('messages.unpin')"
      @click="emit('unpin')"
    >
      <PinOff :size="18" :stroke-width="1.8" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.pinned-message-bar {
  z-index: 2;
  display: flex;
  align-items: stretch;
  min-height: 52px;
  border-bottom: 1px solid #e9edef;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(11, 20, 26, 0.06);
}

.pinned-message-bar__content {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 12px;
  min-width: 0;
  padding: 8px 16px;
  border: 0;
  background: transparent;
  color: var(--site-brand, #008069);
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.pinned-message-bar__content:hover,
.pinned-message-bar__content:active,
.pinned-message-bar__unpin:hover,
.pinned-message-bar__unpin:active {
  background: #f5f7fa;
}

.pinned-message-bar__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.pinned-message-bar__copy strong,
.pinned-message-bar__copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pinned-message-bar__copy strong {
  color: var(--site-brand, #008069);
  font-size: 13px;
  font-weight: 600;
}

.pinned-message-bar__copy span {
  color: #54656f;
  font-size: 12px;
}

.pinned-message-bar__unpin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 48px;
  width: 48px;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #54656f;
  cursor: pointer;
  touch-action: manipulation;
}

.pinned-message-bar__content:focus-visible,
.pinned-message-bar__unpin:focus-visible {
  outline: 2px solid var(--site-brand, #008069);
  outline-offset: -2px;
}

@media (max-width: 960px) {
  .pinned-message-bar__content {
    padding-left: max(12px, env(safe-area-inset-left));
  }

  .pinned-message-bar__unpin {
    flex-basis: max(48px, calc(44px + env(safe-area-inset-right)));
    padding-right: env(safe-area-inset-right);
  }
}
</style>
