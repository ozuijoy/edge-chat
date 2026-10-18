<script setup>
import { computed, ref } from 'vue';
import { resolveServerAssetUrl } from '../../capacitor-platform.ts';

const props = defineProps({
  src: {
    type: String,
    default: ''
  },
  alt: {
    type: String,
    default: ''
  },
  fallback: {
    type: String,
    default: '?'
  },
  size: {
    type: String,
    default: 'default'
  }
});

const initials = computed(() => String(props.fallback || '?').slice(0, 2).toUpperCase());
const failedSrc = ref('');
const resolvedSrc = computed(() => resolveServerAssetUrl(props.src));
const showImage = computed(() => Boolean(resolvedSrc.value) && failedSrc.value !== props.src);

function handleImageError() {
  failedSrc.value = props.src;
}
</script>

<template>
  <div class="ui-avatar" :class="`ui-avatar--${size}`">
    <img v-if="showImage" :src="resolvedSrc" :alt="alt" @error="handleImageError" />
    <span v-else>{{ initials }}</span>
  </div>
</template>
