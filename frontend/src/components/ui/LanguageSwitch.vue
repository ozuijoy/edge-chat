<script setup>
import { Check, Languages } from '@lucide/vue';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { LOCALE_OPTIONS, useI18n } from '../../i18n.js';

const { locale, localeLoading, setLocale, t } = useI18n();
const root = ref(null);
const menuOpen = ref(false);

function closeMenu() {
  menuOpen.value = false;
}

async function toggleMenu() {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) {
    await nextTick();
    root.value?.querySelector('[aria-current="true"]')?.focus();
  }
}

async function selectLocale(value) {
  if (value !== locale.value) await setLocale(value);
  closeMenu();
}

function handleOutsidePointer(event) {
  if (!root.value?.contains(event.target)) closeMenu();
}

onMounted(() => document.addEventListener('pointerdown', handleOutsidePointer));
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleOutsidePointer));
</script>

<template>
  <div ref="root" class="language-switch-wrap" @keydown.esc="closeMenu">
    <button
      type="button"
      class="language-switch"
      :title="t('language.select')"
      :aria-label="t('language.select')"
      :aria-expanded="menuOpen"
      aria-haspopup="menu"
      @click="toggleMenu"
    >
      <Languages :size="21" aria-hidden="true" />
    </button>

    <div v-if="menuOpen" class="language-switch__menu" role="menu" :aria-label="t('language.select')">
      <button
        v-for="option in LOCALE_OPTIONS"
        :key="option.value"
        type="button"
        class="language-switch__option"
        role="menuitem"
        :aria-current="locale === option.value ? 'true' : undefined"
        :disabled="localeLoading"
        @click="selectLocale(option.value)"
      >
        <span :lang="option.value">{{ option.label }}</span>
        <Check v-if="locale === option.value" :size="16" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.language-switch-wrap {
  position: relative;
  display: inline-flex;
}

.language-switch {
  width: 44px;
  min-width: 44px;
  height: 44px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(88, 107, 124, 0.22);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: currentColor;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
  cursor: pointer;
  touch-action: manipulation;
  transition: background 180ms ease, border-color 180ms ease, transform 180ms ease;
}

.language-switch:hover {
  border-color: rgba(45, 156, 151, 0.42);
  background: rgba(255, 255, 255, 0.94);
}

.language-switch:active {
  transform: scale(0.96);
}

.language-switch:focus-visible {
  outline: 2px solid rgba(45, 156, 151, 0.62);
  outline-offset: 2px;
}

.language-switch__menu {
  position: absolute;
  z-index: 120;
  top: calc(100% + 8px);
  right: 0;
  width: 152px;
  padding: 6px;
  border: 1px solid rgba(88, 107, 124, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 12px 32px rgba(27, 44, 56, 0.16);
}

.language-switch__option {
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #1f292e;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.language-switch__option:hover,
.language-switch__option:focus-visible {
  outline: none;
  background: rgba(45, 156, 151, 0.1);
}

.language-switch__option[aria-current='true'] {
  color: #08766a;
  font-weight: 650;
}

@media (prefers-reduced-motion: reduce) {
  .language-switch {
    transition: none;
  }
}
</style>
