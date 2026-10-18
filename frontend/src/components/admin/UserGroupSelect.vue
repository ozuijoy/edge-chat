<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { Check, ChevronDown, LoaderCircle, UsersRound } from '@lucide/vue';
import { t } from '../../i18n.js';

// 用户组选择按钮：替代原生 select，显示当前分组并在浮层中列出可选项。
// 浮层 Teleport 到 body 并用 fixed 定位，因为用户表格外层会裁切溢出内容。
const props = defineProps({ modelValue: Number, roles: Array, hasMore: Boolean, loading: Boolean, disabled: Boolean, currentName: String });
const emit = defineEmits(['update:modelValue', 'more']);
const trigger = ref(null);
const open = ref(false);
const position = ref({});
const label = (role) => (role.id === 1 ? t('rbac.ordinary') : role.name);
const currentLabel = computed(() => {
  const role = props.roles.find((item) => item.id === props.modelValue);
  return role ? label(role) : props.modelValue === 1 || !props.currentName ? t('rbac.ordinary') : props.currentName;
});

function place() {
  const rect = trigger.value.getBoundingClientRect();
  const width = Math.max(rect.width, 220);
  // 下方空间不足时向上展开，避免浮层被视口底部截断。
  const below = window.innerHeight - rect.bottom > 300;
  position.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`,
    width: `${width}px`,
    ...(below ? { top: `${rect.bottom + 6}px` } : { bottom: `${window.innerHeight - rect.top + 6}px` })
  };
}
function close() {
  open.value = false;
  window.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('scroll', close, true);
  window.removeEventListener('resize', close);
}
function outside(event) {
  if (!trigger.value?.contains(event.target) && !event.target.closest?.('.group-picker__panel')) close();
}
async function toggle() {
  if (open.value) return close();
  // 首次打开时才拉取用户组，避免页面加载时为每一行都请求列表。
  if (!props.roles.length && props.hasMore) emit('more');
  place();
  open.value = true;
  await nextTick();
  window.addEventListener('pointerdown', outside, true);
  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
}
function choose(role) {
  close();
  if (role.id !== props.modelValue) emit('update:modelValue', role.id);
  trigger.value?.focus();
}
onBeforeUnmount(close);
</script>
<template>
  <button ref="trigger" type="button" class="group-picker" :class="{ 'group-picker--open': open }" :disabled="disabled"
    aria-haspopup="listbox" :aria-expanded="open" :aria-label="`${t('rbac.group')}: ${currentLabel}`" @click="toggle" @keydown.esc="close">
    <UsersRound :size="15" aria-hidden="true" />
    <span>{{ currentLabel }}</span>
    <ChevronDown :size="15" class="group-picker__chevron" aria-hidden="true" />
  </button>
  <Teleport to="body">
    <div v-if="open" class="group-picker__panel" :style="position" role="listbox" :aria-label="t('rbac.group')" @keydown.esc="close">
      <button v-for="role in roles" :key="role.id" type="button" role="option" class="group-picker__option"
        :class="{ 'group-picker__option--active': role.id === modelValue }" :aria-selected="role.id === modelValue" @click="choose(role)">
        <span><strong>{{ label(role) }}</strong><small v-if="role.id !== 1 && !role.enabled">{{ t('rbac.disabled') }}</small></span>
        <Check v-if="role.id === modelValue" :size="16" aria-hidden="true" />
      </button>
      <p v-if="loading" class="group-picker__hint"><LoaderCircle :size="15" class="admin-spin" />{{ t('common.loading') }}</p>
      <button v-else-if="hasMore" type="button" class="group-picker__more" @click="emit('more')">{{ t('rbac.loadMoreGroups') }}</button>
    </div>
  </Teleport>
</template>
<style>
/* 浮层被 Teleport 到 body，scoped 样式无法命中，因此这里使用带前缀的全局类名。 */
.group-picker {
  display: inline-flex; align-items: center; justify-self: start; gap: 8px; max-width: 220px; min-height: 36px; padding: 0 10px 0 12px;
  border: 1px solid var(--admin-border-strong); border-radius: var(--admin-radius-pill); background: var(--admin-panel);
  color: var(--admin-text); font: inherit; font-size: 0.86rem; font-weight: 600; cursor: pointer;
  transition: border-color var(--admin-duration), background-color var(--admin-duration);
}
.group-picker > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-picker svg { flex-shrink: 0; color: var(--admin-muted); }
.group-picker:hover, .group-picker--open { border-color: var(--admin-green); background: var(--admin-green-bg); }
.group-picker:focus-visible { outline: 2px solid var(--admin-focus); outline-offset: 2px; }
.group-picker:disabled { cursor: not-allowed; opacity: 0.55; }
.group-picker__chevron { transition: transform var(--admin-duration); }
.group-picker--open .group-picker__chevron { transform: rotate(180deg); }
.group-picker__panel {
  position: fixed; z-index: 1000; display: grid; gap: 2px; max-height: 280px; overflow-y: auto; padding: 6px;
  border: 1px solid var(--admin-border); border-radius: var(--admin-radius-panel); background: var(--admin-panel);
  box-shadow: var(--admin-shadow-raised), 0 2px 6px rgba(13, 23, 49, 0.08); font-family: var(--admin-font);
}
.group-picker__option, .group-picker__more {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 40px; padding: 6px 10px;
  border: 0; border-radius: var(--admin-radius-control); background: transparent; color: var(--admin-text);
  font: inherit; font-size: 0.88rem; text-align: left; cursor: pointer;
}
.group-picker__option span { display: grid; min-width: 0; overflow-wrap: anywhere; }
.group-picker__option strong { font-weight: 600; }
.group-picker__option small { color: var(--admin-warning); font-size: 0.74rem; }
.group-picker__option:hover, .group-picker__more:hover { background: var(--admin-active); }
.group-picker__option--active { background: var(--admin-green-bg); color: var(--admin-green-hover); }
.group-picker__option--active svg { color: var(--admin-green); }
.group-picker__more { justify-content: center; color: var(--admin-brand); font-weight: 600; border-top: 1px solid var(--admin-border); border-radius: 0; }
.group-picker__hint { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0; padding: 8px; color: var(--admin-muted); font-size: 0.82rem; }
</style>
