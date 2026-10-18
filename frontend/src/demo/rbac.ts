import { demoState, findDemoUser, findDemoChannel, cloneDemo } from './state.js';
import { ADMIN_PERMISSIONS, PERMISSION_KEYS, hasPermission, validatePermissions } from '../../../shared/admin-permissions.ts';
import { resolvePolicy } from '../../../worker/src/rbac/policies.ts';

function fail(message: string, status = 403): never { throw Object.assign(new Error(message), { status }); }
function roles() {
  if (!demoState.rbacRoles) demoState.rbacRoles = [{ id: 1, key: 'ordinary', name: '普通用户', description: '', enabled: true, revision: 0, permissions: [], updatedAt: new Date().toISOString() }];
  return demoState.rbacRoles;
}
export function demoAuthorization(user) {
  const role = roles().find((r) => r.id === (user.roleId || 1));
  const isSuperAdmin = Boolean(user.isAdmin);
  const permissions = isSuperAdmin ? [...PERMISSION_KEYS] : role?.enabled ? [...role.permissions] : [];
  return { isAdmin: isSuperAdmin, isSuperAdmin, canAccessAdmin: isSuperAdmin || permissions.length > 0, permissions,
    role: role ? { id: role.id, name: role.name, enabled: role.enabled } : null,
    roleRevision: role?.revision || 0, authzVersion: user.authzVersion || 0, managementProtected: Boolean(isSuperAdmin || user.managementProtected) };
}
export function demoOwnsGroup(channelId) {
  const actor = demoAuthorization(findDemoUser(demoState.session.userId));
  return actor.isSuperAdmin || findDemoChannel(channelId)?.ownerId === demoState.session.userId;
}
export function authorizeDemoAdmin(path: string, method: string, body) {
  const policy = resolvePolicy(method, `/api${path}`, body);
  const auth = demoAuthorization(findDemoUser(demoState.session.userId));
  if (!policy || (policy.superOnly && !auth.isSuperAdmin) || !policy.permissions.every((p) => hasPermission(auth, p))) fail('没有此操作权限');
  if (policy.fields && Object.keys(body).some((k) => !policy.fields.includes(k))) fail('请求包含不允许修改的字段', 400);
  const targetId = policy.path.exec(`/api${path}`)?.[1];
  if (policy.scope === 'user') {
    const target = findDemoUser(targetId);
    if (!target) fail('用户不存在', 404);
    if (!auth.isSuperAdmin && demoAuthorization(target).managementProtected) fail('没有此操作权限');
    if (target.id === demoState.session.userId && (policy.id === 'users.delete' || body.isDisabled)) fail('不能删除或封禁自己的账号');
  }
  if (policy.scope === 'group' && !demoOwnsGroup(Number(body.channelId))) fail('没有此操作权限');
  if (policy.scope === 'telegram') {
    const mapping = demoState.telegram.mappings.find((m) => m.id === Number(targetId));
    if (!mapping || !demoOwnsGroup(mapping.channelId)) fail('没有此操作权限');
  }
  if (policy.scope === 'bridge') {
    const binding = demoState.instanceBindings?.find((b) => b.id === targetId);
    if (!binding || !demoOwnsGroup(binding.channelId)) fail('没有此操作权限');
  }
}
export function demoRbac(path: string, method: string, body, offset = 0) {
  if (path === '/me/authorization') return { authorization: demoAuthorization(findDemoUser(demoState.session.userId)) };
  if (path === '/admin/rbac/permissions') return { permissions: ADMIN_PERMISSIONS };
  const list = roles();
  const projection = () => list.map((r) => ({ ...r, memberCount: demoState.users.filter((u) => (u.roleId || 1) === r.id).length }));
  if (path === '/admin/rbac/roles' && method === 'GET') return { roles: cloneDemo(projection().slice(offset, offset + 100)) };
  if (path === '/admin/rbac/roles' && method === 'POST') {
    if (!body.name?.trim() || !validatePermissions(body.permissions)) fail('用户组名称或权限无效', 400);
    list.push({ id: Math.max(...list.map((r) => r.id)) + 1, key: crypto.randomUUID(), ...body, enabled: true, revision: 0, updatedAt: new Date().toISOString() });
    return { ok: true };
  }
  let match = path.match(/^\/admin\/rbac\/roles\/(\d+)(\/members)?$/);
  if (match) {
    const role = list.find((r) => r.id === Number(match[1]));
    if (!role) fail('用户组不存在', 404);
    if (match[2]) return { members: cloneDemo(demoState.users.filter((u) => (u.roleId || 1) === role.id).slice(offset, offset + 100).map((u) => ({ ...u, ...demoAuthorization(u) }))) };
    if (role.id === 1) fail('普通用户组不可修改', 409);
    if (method === 'PATCH') {
      if (role.revision !== body.expectedRevision) fail('数据已变化，请刷新后重试', 409);
      if (!body.name?.trim() || !validatePermissions(body.permissions)) fail('用户组名称或权限无效', 400);
      Object.assign(role, body, { revision: role.revision + 1, updatedAt: new Date().toISOString() });
    } else if (method === 'DELETE') {
      if (demoState.users.some((u) => (u.roleId || 1) === role.id)) fail('用户组仍有成员', 409);
      demoState.rbacRoles = list.filter((r) => r.id !== role.id);
    }
    return { ok: true };
  }
  match = path.match(/^\/admin\/rbac\/users\/(\d+)\/(role|unprotect)$/);
  if (match) {
    const user = findDemoUser(match[1]);
    if (!user || user.isAdmin || (user.authzVersion || 0) !== body.expectedAuthzVersion) fail('数据已变化，请刷新后重试', 409);
    if (match[2] === 'role') {
      if (!list.some((r) => r.id === body.roleId)) fail('用户组不存在', 404);
      user.roleId = body.roleId; if (body.roleId !== 1) user.managementProtected = true;
    } else { if ((user.roleId || 1) !== 1) fail('管理用户不能解除保护', 409); user.managementProtected = false; }
    user.authzVersion = (user.authzVersion || 0) + 1;
    return { ok: true, authorization: demoAuthorization(user), remainingResources: { invitations: [], bridges: [] } };
  }
  if (path === '/admin/audit') return { events: cloneDemo((demoState.adminAudit || []).slice().reverse().slice(offset, offset + 100)) };
  return null;
}
