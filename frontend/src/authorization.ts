import { hasPermission } from '../../shared/admin-permissions.ts';
import store from './store.js';
export const PAGE_PERMISSIONS = {
  dashboard: ['dashboard.read'], users: ['users.read'], channels: ['channels.read'], storage: ['storage.read'],
  invites: ['users.create', 'invites.read'], telegram: ['telegram.read'], site: ['site.read'],
  'instance-bridge': ['instance_bridge.read'], maintenance: ['maintenance.read'],
};
export const can = (key: string) => hasPermission(store.session, key);
export function canVisit(page: string) {
  return page in PAGE_PERMISSIONS ? PAGE_PERMISSIONS[page].some(can) : Boolean(store.session?.isSuperAdmin);
}
export function firstAdminPage() {
  const page = Object.keys(PAGE_PERMISSIONS).find(canVisit);
  return page ? `/admin/${page}` : store.session?.isSuperAdmin ? '/admin/rbac' : '/';
}
