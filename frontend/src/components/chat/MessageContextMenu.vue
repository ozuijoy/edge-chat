<script setup>
import { Copy, Pin, PinOff, Reply, Trash2 } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { t } from '../../i18n.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  canPin: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
  canCopy: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'copy', 'reply', 'pin', 'unpin', 'delete']);

const menuEl = ref(null);
const menuHeight = computed(() =>
  16 + (1 + Number(props.canCopy) + Number(props.canPin) + Number(props.canDelete)) * 40
);
const menuStyle = computed(() => ({
  left: `${Math.max(8, Math.min(props.x, window.innerWidth - 184))}px`,
  top: `${Math.max(8, Math.min(props.y, window.innerHeight - menuHeight.value))}px`
}));

function handleWindowPointerDown(event) {
  if (props.open && !menuEl.value?.contains(event.target)) {
    emit('close');
  }
}

function handleWindowKeydown(event) {
  if (props.open && event.key === 'Escape') {
    emit('close');
  }
}

function closeOpenMenu() {
  if (props.open) {
    emit('close');
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await nextTick();
      menuEl.value?.querySelector('button')?.focus();
    }
  }
);

onMounted(() => {
  window.addEventListener('pointerdown', handleWindowPointerDown);
  window.addEventListener('keydown', handleWindowKeydown);
  window.addEventListener('resize', closeOpenMenu);
  window.addEventListener('scroll', closeOpenMenu, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleWindowPointerDown);
  window.removeEventListener('keydown', handleWindowKeydown);
  window.removeEventListener('resize', closeOpenMenu);
  window.removeEventListener('scroll', closeOpenMenu, true);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="message-menu">
      <div
        v-if="open"
        ref="menuEl"
        class="message-context-menu"
        :style="menuStyle"
        role="menu"
        :aria-label="t('messages.actions')"
        @contextmenu.prevent
      >
		<button type="button" role="menuitem" @click="emit('reply')">
		  <Reply :size="18" :stroke-width="1.8" aria-hidden="true" />
		  {{ t('messages.reply') }}
		</button>
		<button v-if="canCopy" type="button" role="menuitem" @click="emit('copy')">
		  <Copy :size="18" :stroke-width="1.8" aria-hidden="true" />
		  {{ t('messages.copyMarkdown') }}
		</button>
	        <button
          v-if="canPin"
          type="button"
          role="menuitem"
          @click="emit(pinned ? 'unpin' : 'pin')"
        >
          <PinOff v-if="pinned" :size="18" :stroke-width="1.8" aria-hidden="true" />
          <Pin v-else :size="18" :stroke-width="1.8" aria-hidden="true" />
          {{ pinned ? t('messages.unpin') : t('messages.pin') }}
        </button>
        <button
		  v-if="canDelete"
          class="message-context-menu__danger"
          type="button"
          role="menuitem"
          @click="emit('delete')"
        >
          <Trash2 :size="18" :stroke-width="1.8" aria-hidden="true" />
          {{ t('messages.delete') }}
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.message-context-menu {
  position: fixed;
  z-index: 1000;
  width: 176px;
  padding: 8px;
  border: 1px solid rgba(11, 20, 26, 0.08);
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 2px 5px rgba(11, 20, 26, 0.16), 0 6px 18px rgba(11, 20, 26, 0.12);
}

.message-context-menu button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 40px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #111b21;
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.message-context-menu button.message-context-menu__danger {
  color: #c62828;
}

.message-context-menu button:hover,
.message-context-menu button:active {
  background: #f5f6f6;
}

.message-context-menu button:focus-visible {
  outline: 2px solid var(--site-brand, #008069);
  outline-offset: -2px;
}

.message-menu-enter-active,
.message-menu-leave-active {
  transition: opacity 100ms ease, transform 100ms ease;
  transform-origin: top left;
}

.message-menu-enter-from,
.message-menu-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .message-menu-enter-active,
  .message-menu-leave-active {
    transition: none;
  }
}
</style>
