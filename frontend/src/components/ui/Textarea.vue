<script setup>
import { onMounted, ref, useAttrs, watch } from 'vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  autoGrow: {
    type: Boolean,
    default: false
  },
  maxHeight: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['update:modelValue']);
const attrs = useAttrs();
const textareaEl = ref(null);

function syncHeight() {
  if (!props.autoGrow || !textareaEl.value) return;
  textareaEl.value.style.height = 'auto';
  const contentHeight = textareaEl.value.scrollHeight;
  const nextHeight = props.maxHeight > 0 ? Math.min(contentHeight, props.maxHeight) : contentHeight;
  textareaEl.value.style.height = `${nextHeight}px`;
  textareaEl.value.style.overflowY = props.maxHeight > 0 && contentHeight > props.maxHeight ? 'auto' : 'hidden';
}

function handleInput(event) {
  emit('update:modelValue', event.target.value);
}

function focus() {
  textareaEl.value?.focus();
}

defineExpose({ element: textareaEl, focus });

// 等 v-model 写回 DOM 后统一测量，输入与外部清空/恢复草稿都只触发一次布局读取。
watch(() => props.modelValue, syncHeight, { flush: 'post' });
onMounted(syncHeight);
</script>

<template>
  <textarea
    ref="textareaEl"
    class="ui-textarea"
    v-bind="attrs"
    :value="modelValue"
    @input="handleInput"
  ></textarea>
</template>
