<script setup>
import { ref } from 'vue';
import MessageAttachment from './MessageAttachment.vue';
import SenderSourceBadge from './SenderSourceBadge.vue';
import UiAvatar from '../ui/Avatar.vue';
import UiButton from '../ui/Button.vue';
import UiSurface from '../ui/Surface.vue';
import { formatDateTime, t } from '../../i18n.js';

const props = defineProps({
  messages: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  emptyText: {
    type: String,
    default: ''
  },
  sessionUserId: {
    type: Number,
    default: 0
  },
  showOlder: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['load-older']);
const scrollContainer = ref(null);

function isOwnMessage(message) {
  return message.sender.kind !== 'external' && Number(message.sender.id) === Number(props.sessionUserId);
}

function isSameSender(left, right) {
  return left && right
    && left.sender.kind === right.sender.kind
    && left.sender.source === right.sender.source
    && String(left.sender.id) === String(right.sender.id);
}

function bubbleRowClass(message, index) {
  return {
    'chat-bubble-row--own': isOwnMessage(message),
    'chat-bubble-row--stacked': isSameSender(props.messages[index - 1], message)
  };
}

function bubbleClass(message, index) {
  return {
    'chat-bubble--own': isOwnMessage(message),
    'chat-bubble--continued': isSameSender(props.messages[index - 1], message),
    'chat-bubble--tail-hidden': isSameSender(message, props.messages[index + 1])
  };
}

function formatTime(value) {
  return formatDateTime(value);
}

function scrollToBottom() {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
  }
}

defineExpose({
  scrollToBottom
});
</script>

<template>
  <section ref="scrollContainer" class="chat-message-scroll">
    <div class="chat-message-inner">
      <UiButton v-if="showOlder && messages.length" variant="secondary" size="sm" @click="emit('load-older')">
        {{ t('messages.loadEarlier') }}
      </UiButton>

      <UiSurface v-if="loading" tone="soft" class="empty-state">
        {{ t('messages.loading') }}
      </UiSurface>

      <UiSurface v-else-if="error" tone="soft" class="empty-state">
        {{ error }}
      </UiSurface>

      <UiSurface v-else-if="!messages.length" tone="soft" class="empty-state">
        {{ emptyText || t('messages.empty') }}
      </UiSurface>

      <article
        v-for="(message, index) in messages"
        :key="message.id"
        class="chat-bubble-row"
        :class="bubbleRowClass(message, index)"
      >
        <UiAvatar
          v-if="!isOwnMessage(message)"
          :src="message.sender.avatarUrl"
          :fallback="message.sender.displayName"
          size="sm"
        />
        <div class="chat-bubble" :class="bubbleClass(message, index)">
          <div class="chat-bubble__meta">
            <strong>
              {{ isOwnMessage(message) ? t('messages.you') : message.sender.displayName }}
              <SenderSourceBadge :source="message.sender.source" />
            </strong>
            <span>{{ formatTime(message.createdAt) }}</span>
          </div>
          <p v-if="message.content">{{ message.content }}</p>
          <MessageAttachment v-if="message.attachment" :attachment="message.attachment" />
        </div>
      </article>
    </div>
  </section>
</template>
