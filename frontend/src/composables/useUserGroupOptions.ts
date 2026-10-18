import { ref } from 'vue';
import api from '../api.js';

export function useUserGroupOptions() {
  const roles = ref([]);
  const loading = ref(false);
  const hasMore = ref(true);
  const error = ref('');
  async function loadMore() {
    if (loading.value || !hasMore.value) return;
    loading.value = true; error.value = '';
    try {
      const result = await api.rbacRoles(roles.value.length);
      roles.value.push(...result.roles);
      hasMore.value = result.roles.length === 100;
    } catch (e) { error.value = e.message; }
    finally { loading.value = false; }
  }
  return { roles, loading, hasMore, error, loadMore };
}
