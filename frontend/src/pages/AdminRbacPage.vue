<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { ChevronLeft, ChevronRight, Plus, ScrollText, RefreshCw, Save, Trash2, Users, X } from '@lucide/vue';
import api from '../api.js';
import { ADMIN_PERMISSIONS, togglePermission } from '../../../shared/admin-permissions.ts';
import UiButton from '../components/ui/Button.vue';
import UserGroupAssignment from '../components/admin/UserGroupAssignment.vue';
import { formatDateTime, t } from '../i18n.js';
import { useUserGroupOptions } from '../composables/useUserGroupOptions.ts';
const choices = useUserGroupOptions();
const roles = ref([]);
const selected = ref(null);
const editorOpen = ref(false);
const busy = ref(false);
const error = ref('');
const members = ref([]);
const memberOffset = ref(0);
const audit = ref([]);
const auditOpen = ref(false);
const auditOffset = ref(0);
const roleOffset = ref(0);
const workspace = ref(null);
const form = reactive({ name: '', description: '', enabled: true, permissions: [] });
const modules = [...new Set(ADMIN_PERMISSIONS.map((p) => p.module))].map((key) => ({ key, permissions: ADMIN_PERMISSIONS.filter((p) => p.module === key) }));
const changes = computed(() => {
  const previous = selected.value?.permissions || [];
  return { added: form.permissions.filter((p) => !previous.includes(p)), removed: previous.filter((p) => !form.permissions.includes(p)) };
});
const moduleCount = (module) => module.permissions.filter((p) => form.permissions.includes(p.key)).length;
// 整组勾选复用 togglePermission，保证依赖权限（如写需读）与单项勾选规则一致。
function toggleModule(module) {
  const enable = moduleCount(module) < module.permissions.length;
  form.permissions = module.permissions.reduce((current, p) => togglePermission(current, p.key, enable), form.permissions);
}
async function perform(operation) {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try { await operation(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
// 编辑区和成员区位于表格下方，打开后滚动到可视区域，避免用户误以为点击无反应。
async function reveal() { await nextTick(); workspace.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function closeWorkspace() { editorOpen.value = false; selected.value = null; members.value = []; }
async function load() { roles.value = (await api.rbacRoles(roleOffset.value)).roles; }
function edit(role = null) {
  selected.value = role; editorOpen.value = true; members.value = [];
  Object.assign(form, { name: role?.name || '', description: role?.description || '', enabled: role?.enabled ?? true, permissions: [...(role?.permissions || [])] });
  reveal();
}
async function save() {
  if (!window.confirm(t('rbac.confirmSave', { count: selected.value?.memberCount || 0, added: changes.value.added.length, removed: changes.value.removed.length }))) return;
  await perform(async () => {
    await api.saveRbacRole(selected.value?.id, { name: form.name, description: form.description, permissions: form.permissions,
      ...(selected.value ? { enabled: form.enabled, expectedRevision: selected.value.revision } : {}) });
    closeWorkspace(); await load();
  });
}
async function remove(role) {
  if (!window.confirm(t('rbac.confirmDelete', { name: role.name }))) return;
  await perform(async () => { await api.deleteRbacRole(role.id); if (selected.value?.id === role.id) closeWorkspace(); await load(); });
}
async function loadMembers(role, offset = 0) {
  if (!choices.roles.value.length) await choices.loadMore();
  const opening = selected.value?.id !== role.id || editorOpen.value;
  selected.value = role; editorOpen.value = false; memberOffset.value = offset;
  await perform(async () => { members.value = (await api.rbacMembers(role.id, offset)).members; });
  if (opening) reveal();
}
async function memberChanged() {
  await load();
  const role = roles.value.find((r) => r.id === selected.value?.id);
  if (role) await loadMembers(role, memberOffset.value);
}
async function loadAudit(offset = 0) {
  auditOffset.value = offset; auditOpen.value = true;
  await perform(async () => { audit.value = (await api.adminAudit(offset)).events; });
}
async function rolePage(direction) { roleOffset.value += direction * 100; await perform(load); }
onMounted(() => perform(load));
</script>
<template>
  <div class="admin-section rbac-page" :aria-busy="busy">
    <header class="admin-section__header">
      <div class="admin-section__heading"><h2>{{ t('rbac.title') }}</h2><p>{{ t('rbac.description') }}</p></div>
      <div class="inline-actions">
        <UiButton variant="secondary" :disabled="busy" :title="t('common.refresh')" :aria-label="t('common.refresh')" @click="perform(load)"><RefreshCw :size="18" /></UiButton>
        <UiButton :disabled="busy" @click="edit()"><Plus :size="18" />{{ t('rbac.create') }}</UiButton>
      </div>
    </header>
    <p v-if="error || choices.error.value" class="error-text" role="alert">{{ error || choices.error.value }}</p>
    <div class="admin-table-wrap"><table class="list-table">
      <thead><tr><th>{{ t('rbac.group') }}</th><th>{{ t('rbac.members') }}</th><th>{{ t('rbac.permissions') }}</th><th>{{ t('common.status') }}</th><th>{{ t('users.columns.actions') }}</th></tr></thead>
      <tbody><tr v-for="role in roles" :key="role.id" :class="{ 'rbac-row--active': selected?.id === role.id }">
        <td><strong>{{ role.name }}</strong><p class="muted rbac-description">{{ role.description }}</p></td>
        <td>{{ role.memberCount }}</td><td>{{ role.permissions.length }}</td>
        <td>{{ t(role.enabled ? 'common.enabled' : 'rbac.disabled') }}<div class="muted">{{ formatDateTime(role.updatedAt) }}</div></td>
        <td><div class="inline-actions">
          <UiButton v-if="role.id !== 1" variant="secondary" size="sm" :disabled="busy" @click="edit(role)">{{ t('common.edit') }}</UiButton>
          <UiButton variant="secondary" size="sm" :disabled="busy" :title="t('rbac.members')" :aria-label="t('rbac.members')" @click="loadMembers(role)"><Users :size="17" /></UiButton>
          <UiButton v-if="role.id !== 1" variant="destructive" size="sm" :disabled="busy || role.memberCount > 0" :title="t('common.delete')" :aria-label="t('common.delete')" @click="remove(role)"><Trash2 :size="17" /></UiButton>
        </div></td>
      </tr></tbody>
    </table></div>
    <div v-if="roleOffset > 0 || roles.length >= 100" class="rbac-pager"><UiButton variant="secondary" size="sm" :disabled="busy || roleOffset === 0" :aria-label="t('rbac.previous')" @click="rolePage(-1)"><ChevronLeft :size="18" /></UiButton><UiButton variant="secondary" size="sm" :disabled="busy || roles.length < 100" :aria-label="t('rbac.next')" @click="rolePage(1)"><ChevronRight :size="18" /></UiButton></div>

    <div ref="workspace" class="rbac-workspace">
      <form v-if="editorOpen" class="rbac-panel" @submit.prevent="save">
        <header class="rbac-panel__header">
          <div><h3>{{ selected ? selected.name : t('rbac.create') }}</h3><p class="muted">{{ t('rbac.changes', { added: changes.added.length, removed: changes.removed.length }) }}</p></div>
          <UiButton variant="ghost" size="sm" :title="t('common.close')" :aria-label="t('common.close')" @click="closeWorkspace"><X :size="18" /></UiButton>
        </header>
        <div class="rbac-panel__body">
          <div class="rbac-fields">
            <label class="field"><span>{{ t('rbac.name') }}</span><input v-model.trim="form.name" required maxlength="80" /></label>
            <label class="field"><span>{{ t('rbac.note') }}</span><input v-model.trim="form.description" maxlength="500" /></label>
          </div>
          <label v-if="selected" class="rbac-switch"><input v-model="form.enabled" type="checkbox" /><span>{{ t('rbac.enabled') }}</span></label>
          <div class="rbac-subhead"><strong>{{ t('rbac.permissions') }}</strong><span class="muted">{{ form.permissions.length }} / {{ ADMIN_PERMISSIONS.length }}</span></div>
          <div class="rbac-permissions">
            <fieldset v-for="module in modules" :key="module.key">
              <legend class="rbac-sr">{{ t(`rbac.module.${module.key}`) }}</legend>
              <div class="rbac-module__head">
                <strong aria-hidden="true">{{ t(`rbac.module.${module.key}`) }}</strong>
                <span class="rbac-module__count">{{ moduleCount(module) }}/{{ module.permissions.length }}</span>
                <button type="button" class="rbac-module__toggle" @click="toggleModule(module)">{{ t(moduleCount(module) === module.permissions.length ? 'rbac.clearAll' : 'rbac.selectAll') }}</button>
              </div>
              <label v-for="permission in module.permissions" :key="permission.key" class="rbac-permission">
                <input type="checkbox" :checked="form.permissions.includes(permission.key)" @change="form.permissions = togglePermission(form.permissions, permission.key, $event.target.checked)" />
                <span><strong>{{ t(`rbac.permission.${permission.key}`) }}<em v-if="permission.risk !== 'normal'" :class="`rbac-risk rbac-risk--${permission.risk}`">{{ t(`rbac.risk.${permission.risk}`) }}</em></strong><small>{{ t(`rbac.scope.${permission.key}`) }}</small></span>
              </label>
            </fieldset>
          </div>
        </div>
        <footer class="rbac-panel__footer">
          <p class="muted">{{ t('rbac.superOnly') }}</p>
          <div class="inline-actions">
            <UiButton variant="secondary" @click="closeWorkspace">{{ t('common.cancel') }}</UiButton>
            <UiButton type="submit" :disabled="busy || !form.name"><Save :size="17" />{{ t('common.save') }}</UiButton>
          </div>
        </footer>
      </form>

      <section v-else-if="selected" class="rbac-panel">
        <header class="rbac-panel__header">
          <div><h3>{{ selected.name }}</h3><p class="muted">{{ t('rbac.members') }} · {{ selected.memberCount }}</p></div>
          <UiButton variant="ghost" size="sm" :title="t('common.close')" :aria-label="t('common.close')" @click="closeWorkspace"><X :size="18" /></UiButton>
        </header>
        <p v-if="!members.length" class="rbac-empty">{{ t('rbac.noMembers') }}</p>
        <ul v-else class="rbac-member-list">
          <li v-for="user in members" :key="`${user.id}:${user.authzVersion}`" class="rbac-member">
            <span class="rbac-member__avatar" aria-hidden="true">{{ (user.displayName || user.username || '?').slice(0, 1).toUpperCase() }}</span>
            <div class="rbac-member__info"><strong>{{ user.displayName }}</strong><span class="muted">@{{ user.username }}<template v-if="user.deletedAt"> · {{ t('common.deleted') }}</template></span></div>
            <UserGroupAssignment :user="{ ...user, role: { id: selected.id, name: selected.name } }" :roles="choices.roles.value" :has-more-roles="choices.hasMore.value" :roles-loading="choices.loading.value" @more-roles="choices.loadMore" @changed="memberChanged" />
          </li>
        </ul>
        <footer v-if="memberOffset > 0 || members.length >= 100" class="rbac-pager"><UiButton variant="secondary" size="sm" :disabled="busy || memberOffset === 0" :aria-label="t('rbac.previous')" @click="loadMembers(selected, memberOffset - 100)"><ChevronLeft :size="18" /></UiButton><UiButton variant="secondary" size="sm" :disabled="busy || members.length < 100" :aria-label="t('rbac.next')" @click="loadMembers(selected, memberOffset + 100)"><ChevronRight :size="18" /></UiButton></footer>
      </section>
    </div>

    <section class="rbac-panel rbac-audit">
      <header class="rbac-panel__header">
        <div class="rbac-audit__title"><ScrollText :size="18" aria-hidden="true" /><div><h3>{{ t('rbac.audit') }}</h3><p class="muted">{{ t('rbac.auditDescription') }}</p></div></div>
        <div class="inline-actions">
          <UiButton v-if="auditOpen" variant="ghost" size="sm" :disabled="busy" :title="t('common.refresh')" :aria-label="t('common.refresh')" @click="loadAudit(auditOffset)"><RefreshCw :size="16" /></UiButton>
          <UiButton variant="secondary" size="sm" :disabled="busy" @click="auditOpen ? (auditOpen = false) : loadAudit()">{{ t(auditOpen ? 'rbac.auditHide' : 'rbac.auditShow') }}</UiButton>
        </div>
      </header>
      <template v-if="auditOpen">
        <p v-if="!audit.length" class="rbac-empty">{{ t('rbac.auditEmpty') }}</p>
        <div v-else class="admin-table-wrap"><table class="list-table"><thead><tr><th>{{ t('rbac.time') }}</th><th>{{ t('rbac.actor') }}</th><th>{{ t('rbac.action') }}</th><th>{{ t('rbac.target') }}</th></tr></thead><tbody><tr v-for="event in audit" :key="event.id"><td>{{ formatDateTime(event.created_at) }}</td><td>{{ event.actor_name }}</td><td><code class="rbac-action">{{ event.action }}</code></td><td>{{ event.target || '-' }}</td></tr></tbody></table></div>
        <footer v-if="auditOffset > 0 || audit.length >= 100" class="rbac-pager"><UiButton variant="secondary" size="sm" :disabled="busy || auditOffset === 0" :aria-label="t('rbac.previous')" @click="loadAudit(auditOffset - 100)"><ChevronLeft :size="18" /></UiButton><UiButton variant="secondary" size="sm" :disabled="busy || audit.length < 100" :aria-label="t('rbac.next')" @click="loadAudit(auditOffset + 100)"><ChevronRight :size="18" /></UiButton></footer>
      </template>
    </section>
  </div>
</template>
<style scoped src="../styles/admin/rbac.css"></style>
