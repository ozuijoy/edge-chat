import { ADMIN_PERMISSIONS, PERMISSION_KEYS, hasPermission } from '../../../shared/admin-permissions.ts';
import { ApiError } from '../errors.js';
import type { Policy } from './policies.ts';

export const AUTHORIZATION_COLUMNS = `u.is_super_admin, u.management_protected, u.authz_version,
  r.id AS role_id, r.name AS role_name, r.enabled AS role_enabled, r.revision AS role_revision,
  (SELECT json_group_array(permission_key) FROM rbac_role_permissions WHERE role_id = r.id) AS permission_keys`;
export const AUTHORIZATION_JOIN = `LEFT JOIN rbac_user_roles ur ON ur.user_id = u.id LEFT JOIN rbac_roles r ON r.id = ur.role_id`;
export function authorizationFromRow(row) {
  if (!row.role_id) console.error('authorization_membership_missing');
  const isSuperAdmin = Boolean(row.is_super_admin && Number(row.role_id) === 1);
  const stored = JSON.parse(row.permission_keys || '[]');
  const permissions = isSuperAdmin ? [...PERMISSION_KEYS] : row.role_enabled && row.role_id !== 1
    ? stored.filter((key: string) => ADMIN_PERMISSIONS.some((p) => p.key === key && p.dependencies.every((d) => stored.includes(d)))) : [];
  return { isAdmin: isSuperAdmin, isSuperAdmin, canAccessAdmin: isSuperAdmin || permissions.length > 0,
    permissions, managementProtected: Boolean(row.management_protected || isSuperAdmin),
    authzVersion: Number(row.authz_version || 0), roleRevision: Number(row.role_revision || 0),
    role: row.role_id ? { id: Number(row.role_id), name: row.role_name, enabled: Boolean(row.role_enabled) } : null };
}
export async function readAuthorization(db, userId: number) {
  const row = await db.prepare(`SELECT ${AUTHORIZATION_COLUMNS} FROM users u ${AUTHORIZATION_JOIN} WHERE u.id = ?`).bind(userId).first();
  if (!row) throw new ApiError('用户不存在', 404);
  return authorizationFromRow(row);
}
export function requirePermission(auth, key: string) {
  if (!hasPermission(auth, key)) throw new ApiError('没有此操作权限', 403);
}
export function checkPolicy(auth, policy: Policy) {
  if (policy.superOnly && !auth.isSuperAdmin) throw new ApiError('需要超级管理员权限', 403);
  for (const key of policy.permissions) requirePermission(auth, key);
}
export function managedGroupScope(actor, column: string) {
  return actor.isSuperAdmin ? { sql: '1', params: [] } : {
    sql: `EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = ${column} AND cm.user_id = ? AND cm.role = 'owner')`, params: [actor.userId],
  };
}

// SQL 只描述集中策略的授权条件，供读取范围与事务断言共用，不再由各接口手写管理员分支。
export function policyAssertion(policy: Policy, session, target: string | number) {
  const params: unknown[] = [session.userId, session.sessionVersion];
  const required = policy.superOnly ? [] : [...new Set(policy.permissions.flatMap((key) => [key, ...(ADMIN_PERMISSIONS.find((p) => p.key === key)?.dependencies || [])]))];
  const permissions = required.map((key) => {
    params.push(key);
    return `EXISTS (SELECT 1 FROM rbac_role_permissions rp WHERE rp.role_id = r.id AND rp.permission_key = ?)`;
  });
  const superIdentity = '(u.is_super_admin = 1 AND r.id = 1)';
  const capability = policy.superOnly ? superIdentity : `(${superIdentity} OR (r.enabled = 1 AND r.id != 1 AND ${permissions.join(' AND ') || '0'}))`;
  let scope = '1';
  if (policy.scope === 'user') {
    params.push(target);
    scope = `EXISTS (SELECT 1 FROM users t WHERE t.id = ? AND t.deleted_at IS NULL
      AND (u.is_super_admin = 1 OR (t.is_super_admin = 0 AND t.management_protected = 0
        AND NOT EXISTS (SELECT 1 FROM rbac_user_roles tr JOIN rbac_role_permissions tp ON tp.role_id = tr.role_id WHERE tr.user_id = t.id))))`;
  } else if (policy.scope) {
    params.push(target);
    const channel = policy.scope === 'group' ? '?' : policy.scope === 'telegram'
      ? '(SELECT channel_id FROM telegram_mappings WHERE id = ?)' : '(SELECT channel_id FROM instance_bindings WHERE id = ?)';
    scope = `(u.is_super_admin = 1 OR EXISTS (SELECT 1 FROM channel_members cm JOIN channels c ON c.id = cm.channel_id
      WHERE cm.channel_id = ${channel} AND cm.user_id = u.id AND cm.role = 'owner' AND c.deleted_at IS NULL))`;
  }
  return { sql: `EXISTS (SELECT 1 FROM users u ${AUTHORIZATION_JOIN} WHERE u.id = ? AND u.session_version = ?
    AND u.deleted_at IS NULL AND u.is_disabled = 0 AND (u.disabled_until IS NULL OR u.disabled_until <= CURRENT_TIMESTAMP)
    AND ${capability} AND ${scope})`, params };
}

export async function runAuthorizedBatch(db, context, statements, extra?: { sql: string; params: unknown[] }, summary = {}) {
  const assertion = policyAssertion(context.policy, context.session, context.target);
  const requestId = crypto.randomUUID();
  const guard = db.prepare(`INSERT INTO admin_write_guard (request_id, ok) VALUES (?, CASE WHEN ${assertion.sql}${extra ? ` AND (${extra.sql})` : ''} THEN 1 ELSE 0 END)`)
    .bind(requestId, ...assertion.params, ...(extra?.params || []));
  const audit = db.prepare(`INSERT INTO admin_audit_log (request_id, actor_id, actor_name, action, target, summary) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(requestId, context.session.userId, context.session.username, context.policy.id, String(context.target || ''), JSON.stringify(summary));
  try {
    const result = await db.batch([guard, ...statements, audit, db.prepare('DELETE FROM admin_write_guard WHERE request_id = ?').bind(requestId)]);
    return result.slice(1, 1 + statements.length);
  } catch (error) {
    const message = String(error.message);
    if (message.includes('admin_write_guard') || message.includes('CHECK constraint failed: ok')) {
      const current = await db.prepare(`SELECT ${assertion.sql} AS ok`).bind(...assertion.params).first();
      throw new ApiError(current?.ok && extra ? '数据已变化，请刷新后重试' : '没有此操作权限', current?.ok && extra ? 409 : 403);
    }
    if (message.includes('rbac_last_super')) throw new ApiError('必须保留至少一个有效超级管理员', 409);
    if (message.includes('rbac_default') || message.includes('FOREIGN KEY')) throw new ApiError('用户组仍有成员或受系统保护', 409);
    throw error;
  }
}

// 对已有数据层的 run/batch 统一注入同事务复验；查询保持原 D1 API，避免授权规则散落到业务 SQL。
export function authorizedDatabase(db, context) {
  return {
    prepare(sql: string) {
      let statement = db.prepare(sql);
      const wrapped = {
        bind(...params: unknown[]) { statement = statement.bind(...params); return wrapped; },
        all: (...args) => statement.all(...args), first: (...args) => statement.first(...args),
        run: async () => (await runAuthorizedBatch(db, context, [statement]))[0],
        get rawStatement() { return statement; },
      };
      return wrapped;
    },
    batch: (statements) => runAuthorizedBatch(db, context, statements.map((s) => s.rawStatement || s)),
  };
}
