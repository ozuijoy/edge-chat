import { ADMIN_PERMISSIONS, validatePermissions } from '../../../shared/admin-permissions.ts';
import { runAuthorizedBatch, readAuthorization } from '../rbac/authorization.ts';
import { ApiError } from '../errors.js';
import { parseJsonRequest } from '../utils.js';
import { notifyUserInbox } from '../do-bridge.js';

function page(c) {
  const offset = Number(c.req.query('offset') || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new ApiError('分页参数无效', 400);
  return offset;
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new ApiError('请提供当前数据版本', 400);
  return value;
}
function groupInput(data) {
  const name = String(data.name || '').trim();
  const description = String(data.description || '').trim();
  if (!name || name.length > 80 || description.length > 500 || !validatePermissions(data.permissions)) throw new ApiError('用户组名称或权限无效', 400);
  return { name, description, permissions: [...new Set<string>(data.permissions)] };
}
async function changed(c, userId: number) {
  if (!c.env.USER_INBOX) return;
  try { await notifyUserInbox(c.env, userId, { type: 'authorization_changed' }); }
  catch { console.error('authorization_notification_failed'); }
}

export function registerRbacRoutes(app) {
  app.get('/api/me/authorization', (c) => {
    c.header('Cache-Control', 'private, no-store');
    const { isSuperAdmin, canAccessAdmin, permissions, role, roleRevision, authzVersion, managementProtected } = c.get('session');
    return c.json({ authorization: { isSuperAdmin, canAccessAdmin, permissions, role, roleRevision, authzVersion, managementProtected } });
  });
  app.get('/api/admin/rbac/permissions', (c) => c.json({ permissions: ADMIN_PERMISSIONS }));
  app.get('/api/admin/rbac/roles', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT r.*,
      (SELECT COUNT(*) FROM rbac_user_roles WHERE role_id = r.id) AS memberCount,
      (SELECT json_group_array(permission_key) FROM rbac_role_permissions WHERE role_id = r.id) AS permissions
      FROM rbac_roles r ORDER BY r.id LIMIT 100 OFFSET ?`).bind(page(c)).all();
    return c.json({ roles: results.map((r) => ({ ...r, permissions: JSON.parse(r.permissions), enabled: Boolean(r.enabled), updatedAt: r.updated_at })) });
  });
  app.post('/api/admin/rbac/roles', async (c) => {
    const input = groupInput(await parseJsonRequest(c.req.raw));
    const db = c.get('authorizationDatabase');
    const key = crypto.randomUUID();
    await runAuthorizedBatch(db, c.get('authorizationContext'), [
      db.prepare('INSERT INTO rbac_roles (key, name, description, updated_by) VALUES (?, ?, ?, ?)').bind(key, input.name, input.description, c.get('session').userId),
      ...input.permissions.map((p) => db.prepare('INSERT INTO rbac_role_permissions (role_id, permission_key) SELECT id, ? FROM rbac_roles WHERE key = ?').bind(p, key)),
    ], undefined, input);
    return c.json({ ok: true });
  });
  app.patch('/api/admin/rbac/roles/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (id === 1) throw new ApiError('普通用户组不可修改', 409);
    const data = await parseJsonRequest(c.req.raw);
    const input = groupInput(data);
    if (typeof data.enabled !== 'boolean') throw new ApiError('用户组状态无效', 400);
    const expected = revision(data.expectedRevision);
    const db = c.get('authorizationDatabase');
    const before = await db.prepare('SELECT * FROM rbac_roles WHERE id = ?').bind(id).first();
    await runAuthorizedBatch(db, c.get('authorizationContext'), [
      db.prepare('UPDATE rbac_roles SET name = ?, description = ?, enabled = ?, revision = revision + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(input.name, input.description, data.enabled ? 1 : 0, c.get('session').userId, id),
      db.prepare('DELETE FROM rbac_role_permissions WHERE role_id = ?').bind(id),
      ...input.permissions.map((p) => db.prepare('INSERT INTO rbac_role_permissions (role_id, permission_key) VALUES (?, ?)').bind(id, p)),
      db.prepare(`UPDATE users SET management_protected = 1, authz_version = authz_version + 1 WHERE id IN
        (SELECT user_id FROM rbac_user_roles WHERE role_id = ?)`).bind(id),
    ], { sql: 'EXISTS (SELECT 1 FROM rbac_roles WHERE id = ? AND revision = ?)', params: [id, expected] }, { before: { name: before?.name, enabled: before?.enabled }, after: { ...input, enabled: data.enabled } });
    // 大组不逐个唤醒闲置 DO；通知有限批，其他会话在前台恢复与请求拒绝时刷新，服务端仍即时撤权。
    const { results } = await db.prepare('SELECT user_id FROM rbac_user_roles WHERE role_id = ? LIMIT 100').bind(id).all();
    c.executionCtx.waitUntil(Promise.all(results.map((u) => changed(c, u.user_id))));
    return c.json({ ok: true });
  });
  app.delete('/api/admin/rbac/roles/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (id === 1) throw new ApiError('普通用户组不可删除', 409);
    const db = c.get('authorizationDatabase');
    await runAuthorizedBatch(db, c.get('authorizationContext'), [db.prepare('DELETE FROM rbac_roles WHERE id = ?').bind(id)],
      { sql: 'NOT EXISTS (SELECT 1 FROM rbac_user_roles WHERE role_id = ?)', params: [id] });
    return c.json({ ok: true });
  });
  app.get('/api/admin/rbac/roles/:id/members', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT u.id, u.username, u.display_name AS displayName, u.deleted_at AS deletedAt,
      u.authz_version AS authzVersion, u.is_super_admin AS isSuperAdmin, u.management_protected AS managementProtected FROM users u JOIN rbac_user_roles ur ON ur.user_id = u.id
      WHERE ur.role_id = ? ORDER BY u.id LIMIT 100 OFFSET ?`).bind(Number(c.req.param('id')), page(c)).all();
    return c.json({ members: results });
  });
  app.put('/api/admin/rbac/users/:id/role', async (c) => {
    const userId = Number(c.req.param('id'));
    const data = await parseJsonRequest(c.req.raw);
    const roleId = Number(data.roleId);
    if (!Number.isSafeInteger(roleId) || roleId < 1) throw new ApiError('用户组无效', 400);
    const expected = revision(data.expectedAuthzVersion);
    const db = c.get('authorizationDatabase');
    await runAuthorizedBatch(db, c.get('authorizationContext'), [
      db.prepare('UPDATE rbac_user_roles SET role_id = ?, assigned_by = ?, assigned_at = CURRENT_TIMESTAMP WHERE user_id = ?').bind(roleId, c.get('session').userId, userId),
      db.prepare('UPDATE users SET management_protected = CASE WHEN ? != 1 THEN 1 ELSE management_protected END, authz_version = authz_version + 1 WHERE id = ?').bind(roleId, userId),
    ], { sql: `EXISTS (SELECT 1 FROM users WHERE id = ? AND is_super_admin = 0 AND authz_version = ?)
      AND EXISTS (SELECT 1 FROM rbac_roles WHERE id = ?)`, params: [userId, expected, roleId] }, { roleId });
    c.executionCtx.waitUntil(changed(c, userId));
    const { results: invitations } = await db.prepare('SELECT id, note FROM registration_invites WHERE created_by = ? AND deleted_at IS NULL AND used_count < max_uses LIMIT 100').bind(userId).all();
    const { results: bridges } = await db.prepare("SELECT id, channel_name FROM instance_bindings WHERE created_by = ? AND status != 'revoked' LIMIT 100").bind(userId).all();
    return c.json({ ok: true, remainingResources: { invitations, bridges }, authorization: await readAuthorization(db, userId) });
  });
  app.post('/api/admin/rbac/users/:id/unprotect', async (c) => {
    const id = Number(c.req.param('id'));
    const data = await parseJsonRequest(c.req.raw);
    const db = c.get('authorizationDatabase');
    await runAuthorizedBatch(db, c.get('authorizationContext'), [db.prepare('UPDATE users SET management_protected = 0, authz_version = authz_version + 1 WHERE id = ?').bind(id)],
      { sql: `EXISTS (SELECT 1 FROM users u JOIN rbac_user_roles ur ON ur.user_id = u.id
        WHERE u.id = ? AND u.is_super_admin = 0 AND ur.role_id = 1 AND u.authz_version = ?)`, params: [id, revision(data.expectedAuthzVersion)] });
    return c.json({ ok: true });
  });
  app.get('/api/admin/audit', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT * FROM admin_audit_log ORDER BY id DESC LIMIT 100 OFFSET ?').bind(page(c)).all();
    return c.json({ events: results });
  });
}
