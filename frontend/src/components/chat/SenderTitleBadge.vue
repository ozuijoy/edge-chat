<script setup>
import { computed } from 'vue';
import { t } from '../../i18n.js';

const props = defineProps({
  identity: {
    type: Object,
    default: null
  }
});

const title = computed(() => {
  if (props.identity?.kind === 'external') return null;
  if (props.identity?.isDisabled) return { label: t('titles.muted'), tone: 'muted' };
  if (props.identity?.isAdmin) return { label: t('titles.administrator'), tone: 'administrator' };
  return null;
});
</script>

<template>
  <span v-if="title" class="sender-title" :class="`sender-title--${title.tone}`">
    {{ title.label }}
  </span>
</template>

<style scoped>
.sender-title {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: 16px;
  padding: 0 5px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 650;
  line-height: 16px;
  white-space: nowrap;
}

.sender-title--administrator {
  background: color-mix(in srgb, var(--chat-accent) 12%, transparent);
  color: var(--chat-accent);
}

.sender-title--muted {
  background: var(--chat-danger-soft);
  color: var(--chat-danger);
}
</style>
