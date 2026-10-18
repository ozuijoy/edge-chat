<script setup>
import UiBadge from '../ui/Badge.vue';
import UiDot from '../ui/Dot.vue';
import { t } from '../../i18n.js';

defineProps({
  title: {
    type: String,
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  },
  wsStatus: {
    type: String,
    default: 'closed'
  }
});
</script>

<template>
  <header class="window-topbar window-topbar--sticky">
    <div class="chat-main__meta">
      <div class="window-heading">
        <h1>{{ title || t('chat.noConversationSelected') }}</h1>
        <p>{{ subtitle }}</p>
      </div>
    </div>

    <UiBadge :variant="wsStatus === 'open' ? 'success' : 'secondary'">
      <UiDot :tone="wsStatus === 'open' ? 'cool' : 'neutral'" size="sm" />
      {{ wsStatus === 'open' ? t('roomHeader.connected') : t('roomHeader.connecting') }}
    </UiBadge>
  </header>
</template>
