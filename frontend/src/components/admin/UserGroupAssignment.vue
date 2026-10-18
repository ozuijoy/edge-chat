<script setup>
import { ref } from 'vue';
import { ShieldOff } from '@lucide/vue';
import api from '../../api.js';
import UiButton from '../ui/Button.vue';
import { t } from '../../i18n.js';
import UserGroupSelect from './UserGroupSelect.vue';
const props = defineProps({ user: { type: Object, required: true }, roles: { type: Array, required: true }, hasMoreRoles: Boolean, rolesLoading: Boolean });
const emit = defineEmits(['changed', 'moreRoles']);
const roleId = ref(props.user.role?.id || 1);
const saving = ref(false);
const error = ref('');
const notice = ref('');
// 选中即提交：原先「下拉 + 保存」两步容易漏点保存，确认弹窗已足够防误操作。
async function assign(nextId) {
  if (!window.confirm(t('rbac.confirmAssign', { name: props.user.displayName }))) return;
  const previous = roleId.value;
  roleId.value = nextId; saving.value = true; error.value = ''; notice.value = '';
  try {
    const result = await api.assignRbacRole(props.user.id, { roleId: nextId, expectedAuthzVersion: props.user.authzVersion });
    const count = (result.remainingResources?.invitations.length || 0) + (result.remainingResources?.bridges.length || 0);
    if (count) { notice.value = t('rbac.remainingResources', { count }); window.alert(notice.value); }
    emit('changed');
  } catch (e) { roleId.value = previous; error.value = e.message; } finally { saving.value = false; }
}
async function unprotect() {
  if (!window.confirm(t('rbac.confirmUnprotect', { name: props.user.displayName }))) return;
  saving.value = true; error.value = '';
  try { await api.unprotectUser(props.user.id, props.user.authzVersion); emit('changed'); }
  catch (e) { error.value = e.message; } finally { saving.value = false; }
}
</script>
<template>
  <div v-if="!user.isSuperAdmin" class="group-assignment">
    <div class="group-assignment__actions">
      <UserGroupSelect :model-value="roleId" :roles="roles" :has-more="hasMoreRoles" :loading="rolesLoading" :disabled="saving" :current-name="user.role?.name" @update:model-value="assign" @more="emit('moreRoles')" />
      <UiButton v-if="user.managementProtected && user.role?.id === 1" variant="secondary" size="sm" :disabled="saving" :title="t('rbac.unprotect')" :aria-label="t('rbac.unprotect')" @click="unprotect"><ShieldOff :size="15" /></UiButton>
    </div>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="notice" class="muted" role="status">{{ notice }}</p>
  </div>
</template>
<style scoped>
.group-assignment { margin-top: 8px; }
.group-assignment__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.group-assignment button.ui-button { min-height: 36px; min-width: 36px; border-radius: var(--admin-radius-pill); }
.group-assignment p { max-width: 300px; margin: 6px 0 0; white-space: normal; overflow-wrap: anywhere; }
</style>
