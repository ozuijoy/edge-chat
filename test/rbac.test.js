import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import initSqlJs from 'sql.js';
import worker from '../worker/src/index.js';
import { createSession, hashPassword } from '../worker/src/auth.js';
import { getUserByUsername } from '../worker/src/data/users.js';
import { ADMIN_PERMISSIONS, PERMISSION_KEYS, togglePermission } from '../shared/admin-permissions.ts';
import { resolvePolicy } from '../worker/src/rbac/policies.ts';
import { runAuthorizedBatch, readAuthorization, authorizedDatabase } from '../worker/src/rbac/authorization.ts';
import { authorizeRoom, authorizeChannelManagement } from '../worker/src/room-access.js';
import { createD1Adapter, createKvAdapter } from './support/d1.js';
import { generateRecoverySql } from '../.github/scripts/generate-admin-recovery-sql.mjs';
import { ChannelRoom } from '../worker/src/do/ChannelRoom.js';
import { spawnSync } from 'node:child_process';
const SQL = await initSqlJs();
const schema = readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8');
const password = await hashPassword('test-password');
async function harness() {
  const database = new SQL.Database(); database.exec(schema);
  for (const name of ['root', 'delegate', 'regular', 'secondroot']) database.run(`INSERT INTO users
    (username, display_name, password_hash, password_salt, is_super_admin, management_protected) VALUES (?, ?, ?, ?, ?, ?)`,
    [name, name, password.hash, password.salt, name.includes('root') ? 1 : 0, name.includes('root') ? 1 : 0]);
  const env = { DB: createD1Adapter(database), SESSIONS: createKvAdapter() };
  const root = await createSession(env, await getUserByUsername(env.DB, 'root'));
  const delegate = await createSession(env, await getUserByUsername(env.DB, 'delegate'));
  const regular = await createSession(env, await getUserByUsername(env.DB, 'regular'));
  async function request(path, body, { method = body ? 'POST' : 'GET', token = root.token, headers = {} } = {}) {
    const response = await worker.fetch(new Request(`https://rbac.test/api${path}`, { method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil(promise) { promise.catch(() => {}); } });
    return { status: response.status, body: await response.json(), cacheControl: response.headers.get('cache-control') };
  }
  async function grant(permissions = ['users.read']) {
    const result = await request('/admin/rbac/roles', { name: 'reviewers', description: '', permissions }); assert.equal(result.status, 200);
    const roles = (await request('/admin/rbac/roles')).body.roles; const role = roles.find((r) => r.id !== 1);
    const user = await env.DB.prepare('SELECT authz_version FROM users WHERE id = 2').first();
    assert.equal((await request('/admin/rbac/users/2/role', { roleId: role.id, expectedAuthzVersion: user.authz_version }, { method: 'PUT' })).status, 200);
    return role;
  }
  return { database, env, root, delegate, regular, request, grant };
}

test('RBAC：只读子管理员、普通用户与仅用户权限的模块隔离', async () => {
  const h = await harness(); await h.grant();
  const snapshot = (await h.request('/me/authorization', null, { token: h.delegate.token })).body.authorization;
  assert.equal(snapshot.isSuperAdmin, false); assert.equal(snapshot.canAccessAdmin, true); assert.deepEqual(snapshot.permissions, ['users.read']);
  assert.equal((await h.request('/admin/users', null, { token: h.delegate.token })).status, 200);
  assert.ok((await h.request('/admin/users', null, { token: h.delegate.token })).body.users.every((user) => !('permissions' in user)));
  for (const path of ['/admin/overview', '/admin/site-settings', '/admin/register-links', '/admin/storage', '/admin/storage/scan', '/admin/telegram', '/admin/instance-bridge', '/admin/maintenance', '/admin/rbac/roles', '/admin/audit', '/admin/dms', '/admin/channels']) {
    assert.equal((await h.request(path, null, { token: h.delegate.token })).status, 403, path);
    assert.equal((await h.request(path, null, { token: h.regular.token })).status, 403, path);
  }
  assert.equal((await h.request('/admin/users/3', { displayName: 'changed' }, { method: 'PATCH', token: h.delegate.token })).status, 403);
  assert.equal((await h.request('/admin/users/3/reset-password', { password: 'secret' }, { token: h.delegate.token })).status, 403);
  assert.equal((await h.request('/admin/users/3/details', null, { token: h.delegate.token })).status, 403);
  assert.equal((await h.request('/admin/users', null, { token: '', headers: { Cookie: `__Host-session=${h.regular.token}` } })).status, 403);
});

test('RBAC：普通组不可修改、未知权限和缺少依赖拒绝、全选不产生超管', async () => {
  const h = await harness();
  for (const permissions of [['*'], ['unknown.write'], ['users.ban']]) assert.equal((await h.request('/admin/rbac/roles', { name: 'bad', description: '', permissions })).status, 400);
  const role = await h.grant(PERMISSION_KEYS);
  assert.equal((await h.request('/admin/rbac/roles/1', null, { method: 'DELETE' })).status, 409);
  assert.equal((await h.request(`/admin/rbac/roles/${role.id}`, null, { method: 'DELETE' })).status, 409);
  for (const path of ['/admin/rbac/roles', '/admin/stealth', '/admin/audit']) assert.equal((await h.request(path, null, { token: h.delegate.token })).status, 403);
  assert.equal((await h.request('/admin/users/3/reset-password', { password: 'takeover' }, { token: h.delegate.token })).status, 403);
  assert.equal((await h.request('/admin/telegram/config', { botToken: 'not-a-token' }, { method: 'PUT', token: h.delegate.token })).status, 403);
  assert.throws(() => h.database.run("INSERT INTO rbac_role_permissions VALUES (1, 'users.read')"), /rbac_default_protected/);
  assert.deepEqual(togglePermission(['users.read', 'users.ban'], 'users.read', false), []);
});

test('RBAC：用户字段白名单、混合动作权限与受保护历史账号', async () => {
  const h = await harness(); await h.grant(['users.read', 'users.create', 'users.ban', 'users.login_history.read']);
  for (const field of ['isAdmin', 'is_admin', 'is_super_admin', 'management_protected', 'permissions', 'authz_version', 'roleId']) {
    const result = await h.request('/admin/users', { username: `injected-${field}`, displayName: 'bad', password: 'bad', [field]: field === 'roleId' ? 2 : true }, { token: h.delegate.token });
    assert.ok([400, 403].includes(result.status), field);
  }
  assert.equal((await h.request('/admin/users/3', { displayName: 'must not change', isDisabled: true }, { method: 'PATCH', token: h.delegate.token })).status, 403);
  assert.equal((await h.request('/admin/users/3', { isDisabled: true }, { method: 'PATCH', token: h.delegate.token })).status, 200);
  assert.equal((await h.request('/admin/users/1', { isDisabled: true }, { method: 'PATCH', token: h.delegate.token })).status, 403);
  assert.equal((await h.request('/admin/users/2', { isDisabled: true }, { method: 'PATCH', token: h.delegate.token })).status, 403);
  await h.request('/admin/rbac/users/2/role', { roleId: 1, expectedAuthzVersion: 1 }, { method: 'PUT' });
  assert.equal((await h.env.DB.prepare('SELECT management_protected FROM users WHERE id = 2').first()).management_protected, 1);
  assert.equal((await h.request('/me/profile', { is_super_admin: true, displayName: 'evil' }, { method: 'PATCH', token: h.delegate.token })).status, 400);
});

test('RBAC：撤权对旧 Bearer 和 Cookie 生效，不踢出合法聊天会话', async () => {
  const h = await harness(); const role = await h.grant(['users.read', 'users.ban']);
  const edit = { name: role.name, description: '', enabled: false, permissions: role.permissions, expectedRevision: role.revision };
  assert.equal((await h.request(`/admin/rbac/roles/${role.id}`, edit, { method: 'PATCH' })).status, 200);
  assert.equal((await h.request('/admin/users', null, { token: h.delegate.token })).status, 403);
  assert.equal((await h.request('/admin/users', null, { token: '', headers: { Cookie: `__Host-session=${h.delegate.token}` } })).status, 403);
  assert.equal((await h.request('/bootstrap', null, { token: h.delegate.token })).status, 200);
  assert.equal((await h.request('/auth/session', null, { token: h.delegate.token })).body.session.canAccessAdmin, false);
  assert.equal((await h.env.DB.prepare('SELECT session_version FROM users WHERE id = 2').first()).session_version, 0);
});

test('RBAC：用户组与分配版本冲突、自我保护及最后有效超管不变量', async () => {
  const h = await harness(); const role = await h.grant();
  assert.equal((await h.request('/admin/rbac/users/2/role', { roleId: 1, expectedAuthzVersion: 0 }, { method: 'PUT' })).status, 409);
  const data = { name: role.name, description: '', enabled: true, permissions: [], expectedRevision: role.revision };
  assert.equal((await h.request(`/admin/rbac/roles/${role.id}`, data, { method: 'PATCH' })).status, 200);
  assert.equal((await h.request(`/admin/rbac/roles/${role.id}`, data, { method: 'PATCH' })).status, 409);
  assert.equal((await h.request('/admin/users/1', { isDisabled: true }, { method: 'PATCH' })).status, 403);
  assert.equal((await h.request('/admin/users/1', null, { method: 'DELETE' })).status, 403);
  h.database.run('UPDATE users SET is_disabled = 1 WHERE id = 4');
  for (const sql of ['UPDATE users SET is_super_admin = 0 WHERE id = 1', "UPDATE users SET disabled_until = datetime('now', '+1 hour') WHERE id = 1", 'DELETE FROM users WHERE id = 1']) assert.throws(() => h.database.run(sql), /rbac_last_super|FOREIGN KEY/);
});

test('RBAC：事务内撤权、目标提权与审计失败均阻断整批写入', async () => {
  const h = await harness(); const role = await h.grant(['users.read', 'users.ban']);
  const authorization = await readAuthorization(h.env.DB, 2);
  const context = { session: { ...h.delegate, ...authorization }, policy: resolvePolicy('PATCH', '/api/admin/users/3', { isDisabled: true }), target: 3 };
  const update = () => h.env.DB.prepare('UPDATE users SET is_disabled = 1 WHERE id = 3');
  h.database.run('UPDATE rbac_roles SET enabled = 0 WHERE id = ?', [role.id]);
  await assert.rejects(() => runAuthorizedBatch(h.env.DB, context, [update()]), (e) => e.status === 403);
  h.database.run('UPDATE rbac_roles SET enabled = 1 WHERE id = ?', [role.id]);
  h.database.run('UPDATE users SET management_protected = 1 WHERE id = 3');
  await assert.rejects(() => runAuthorizedBatch(h.env.DB, context, [update()]), (e) => e.status === 403);
  h.database.run('UPDATE users SET management_protected = 0 WHERE id = 3');
  h.database.run("CREATE TRIGGER reject_audit BEFORE INSERT ON admin_audit_log BEGIN SELECT RAISE(ABORT, 'test audit failure'); END");
  await assert.rejects(() => runAuthorizedBatch(h.env.DB, context, [update()]), /test audit failure/);
  assert.equal((await h.env.DB.prepare('SELECT is_disabled FROM users WHERE id = 3').first()).is_disabled, 0);
  assert.equal((await h.env.DB.prepare('SELECT COUNT(*) AS n FROM admin_write_guard').first()).n, 0);
  h.database.run('DROP TRIGGER reject_audit');
  const guarded = authorizedDatabase(h.env.DB, context);
  await guarded.prepare('UPDATE users SET display_name = ? WHERE id = ?').bind('bound-value', 3).run();
  assert.equal((await h.env.DB.prepare('SELECT display_name FROM users WHERE id = 3').first()).display_name, 'bound-value');
});

test('RBAC：聚合概况不带明细、邀请只读不带凭据且注册不能提权', async () => {
  const h = await harness(); await h.grant(['dashboard.read', 'invites.read']);
  const overview = await h.request('/admin/overview', null, { token: h.delegate.token });
  assert.equal(overview.status, 200); assert.deepEqual(Object.keys(overview.body).sort(), ['site', 'stats']);
  const invite = (await h.request('/admin/register-links', { note: 'test', maxUses: 3 })).body.invite;
  const invites = (await h.request('/admin/register-links', null, { token: h.delegate.token })).body.invites;
  assert.equal('token' in invites[0], false);
  assert.equal((await h.request(`/register-links/${invite.token}/register`, { username: 'bad', displayName: 'bad', password: 'bad', roleId: 2 }, { token: '' })).status, 400);
  assert.equal((await h.request(`/register-links/${invite.token}/register`, { username: 'new', displayName: 'new', password: 'new' }, { token: '' })).status, 200);
  const row = await h.env.DB.prepare('SELECT u.is_super_admin, ur.role_id FROM users u JOIN rbac_user_roles ur ON ur.user_id = u.id WHERE username = ?').bind('new').first();
  assert.deepEqual(row, { is_super_admin: 0, role_id: 1 });
});

test('RBAC：超级管理员创建子管理员原子分组，登录记录仍是独立敏感权限', async () => {
  const h = await harness(); const role = await h.grant(['users.read', 'users.login_history.read']);
  assert.equal((await h.request('/admin/users', { username: 'new-admin', displayName: 'new-admin', password: 'new-password', roleId: role.id })).status, 200);
  const row = await h.env.DB.prepare('SELECT u.is_super_admin, u.management_protected, ur.role_id FROM users u JOIN rbac_user_roles ur ON ur.user_id = u.id WHERE username = ?').bind('new-admin').first();
  assert.deepEqual(row, { is_super_admin: 0, management_protected: 1, role_id: role.id });
  assert.equal((await h.request('/admin/users/3/details', null, { token: h.delegate.token })).status, 200);
  assert.equal((await h.request('/admin/users/1/details', null, { token: h.delegate.token })).status, 404);
  assert.equal((await h.request('/admin/users/2/details', null, { token: h.delegate.token })).status, 404);
  const before = (await h.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;
  assert.equal((await h.request('/admin/users', { username: 'bad-role', displayName: 'bad', password: 'bad', roleId: 999 })).status, 409);
  assert.equal((await h.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n, before);
});

test('RBAC：后台身份不放行私有房间，缺少分组不会回退旧 is_admin', async () => {
  const h = await harness();
  h.database.run("INSERT INTO channels (id, name, kind, created_by) VALUES (10, 'secret', 'private', 3)");
  h.database.run("INSERT INTO channel_members (channel_id, user_id, role) VALUES (10, 3, 'owner')");
  for (const actor of [h.root, { ...h.delegate, isAdmin: true }]) {
    assert.equal((await authorizeRoom(h.env.DB, actor, 'private', 10)).ok, false);
    assert.equal((await authorizeChannelManagement(h.env.DB, actor, 10)).ok, false);
  }
  h.database.run('UPDATE users SET is_admin = 1 WHERE id = 2');
  assert.equal((await h.request('/admin/users', null, { token: h.delegate.token })).status, 403);
  h.database.run('DELETE FROM rbac_user_roles WHERE user_id = 1');
  assert.equal((await h.request('/admin/users')).status, 403);
});

test('RBAC：所有后台路由均登记策略，新权限不会自动授予已有组', () => {
  for (const file of readdirSync(new URL('../worker/src/api/', import.meta.url)).filter((name) => /\.(?:js|ts)$/.test(name))) {
    const source = readFileSync(new URL(`../worker/src/api/${file}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/app\.(get|post|put|patch|delete)\(['"](\/api\/admin\/[^'"]+)['"]/g)) {
      const path = match[2].replace(/:[A-Za-z]+/g, '1');
      assert.ok(resolvePolicy(match[1].toUpperCase(), path, { displayName: 'a' }), `${file}: ${match[1]} ${path}`);
    }
  }
  assert.equal(resolvePolicy('GET', '/api/admin/undeclared'), null);
  assert.equal(ADMIN_PERMISSIONS.length, 21);
});

test('RBAC：旧实例一次性迁移保留管理员与普通用户，不解封或覆盖数据', async () => {
  const oldSchema = schema.slice(0, schema.indexOf('CREATE TABLE IF NOT EXISTS rbac_roles')) + schema.slice(schema.indexOf('-- 每个用户最多三次登录'));
  const old = oldSchema.replace(/^  (is_super_admin|management_protected|authz_version) .*\r?\n/gm, '');
  const database = new SQL.Database(); database.exec(old);
  database.run("INSERT INTO users (username, display_name, password_hash, password_salt, is_admin, is_disabled) VALUES ('admin', 'admin', 'hash', 'salt', 1, 1), ('member', 'member', 'hash', 'salt', 0, 0)");
  database.exec(readFileSync(new URL('../worker/migrations/2026-10-06-rbac.sql', import.meta.url), 'utf8'));
  const db = createD1Adapter(database);
  assert.deepEqual((await db.prepare('SELECT is_super_admin, management_protected, is_disabled FROM users ORDER BY id').all()).results,
    [{ is_super_admin: 1, management_protected: 1, is_disabled: 1 }, { is_super_admin: 0, management_protected: 0, is_disabled: 0 }]);
  assert.deepEqual(database.exec('PRAGMA foreign_key_check'), []);
});

test('RBAC：Cookie 同源、管理 query token 与授权基础设施失败', async () => {
  const h = await harness();
  const cookie = { token: '', headers: { Cookie: `__Host-session=${h.root.token}` } };
  assert.equal((await h.request('/admin/rbac/roles', { name: 'cross-site', permissions: [] }, cookie)).status, 403);
  assert.equal((await h.request('/admin/rbac/roles', { name: 'same-site', permissions: [] }, { ...cookie, headers: { ...cookie.headers, Origin: 'https://rbac.test' } })).status, 200);
  assert.equal((await h.request(`/admin/users?token=${h.root.token}`, null, { token: '' })).status, 401);
  assert.equal((await h.request('/admin/users', null, { token: '' })).cacheControl, 'private, no-store');
  assert.equal((await h.request('/admin/storage/scan', {}, cookie)).status, 403);
  h.env.DB = { prepare() { throw new Error('D1 offline details'); } };
  const result = await h.request('/admin/users');
  assert.equal(result.status, 503); assert.doesNotMatch(JSON.stringify(result.body), /offline details|stack/);
});

test('RBAC：桥接候选、映射 ID 与写事务采用同一群主范围', async () => {
  const h = await harness(); await h.grant(['telegram.read', 'telegram.mappings.manage', 'instance_bridge.read', 'instance_bridge.manage']);
  h.database.run("INSERT INTO channels (id, name, kind, created_by) VALUES (10, 'mine', 'private', 2), (11, 'other', 'private', 3)");
  h.database.run("INSERT INTO channel_members (channel_id, user_id, role) VALUES (10, 2, 'owner'), (11, 3, 'owner')");
  h.database.run("INSERT INTO telegram_mappings (channel_id, telegram_chat_id) VALUES (10, '-10'), (11, '-11')");
  const delegate = { token: h.delegate.token };
  const telegram = (await h.request('/admin/telegram', null, delegate)).body;
  assert.deepEqual(telegram.channels.map((c) => c.id), [10]);
  assert.deepEqual(telegram.mappings.map((m) => m.channelId), [10]);
  assert.equal((await h.request('/admin/telegram/mappings/2', { enabled: false }, { ...delegate, method: 'PATCH' })).status, 403);
  assert.equal((await h.request('/admin/telegram/mappings/1', { enabled: false }, { ...delegate, method: 'PATCH' })).status, 200);
  assert.deepEqual((await h.request('/admin/instance-bridge', null, delegate)).body.channels.map((c) => c.id), [10]);
  assert.equal((await h.request('/admin/instance-bridge/invitations', { channelId: 11 }, delegate)).status, 403);
  const context = { session: h.delegate, policy: resolvePolicy('PATCH', '/api/admin/telegram/mappings/1', { enabled: true }), target: 1 };
  h.database.run("UPDATE channel_members SET role = 'member' WHERE channel_id = 10 AND user_id = 2");
  await assert.rejects(() => runAuthorizedBatch(h.env.DB, context, [h.env.DB.prepare('UPDATE telegram_mappings SET enabled = 1 WHERE id = 1')]), (e) => e.status === 403);
  assert.equal((await h.env.DB.prepare('SELECT enabled FROM telegram_mappings WHERE id = 1').first()).enabled, 0);
});

test('RBAC：存储只读快照、扫描限速与撤权后继续扫描拒绝', async () => {
  const h = await harness(); const role = await h.grant(['storage.read', 'storage.scan']);
  let lists = 0;
  h.env.FILES = { list: async () => { lists++; return { objects: [{ key: '3/secret.txt', size: 20, uploaded: new Date() }], truncated: false }; } };
  const delegate = { token: h.delegate.token };
  assert.equal((await h.request('/admin/storage/scan', null, delegate)).status, 403);
  const first = await h.request('/admin/storage/scan', {}, delegate);
  assert.equal(first.status, 200); assert.equal(JSON.stringify(first.body).includes('secret.txt'), false);
  assert.equal((await h.request('/admin/storage/scan', {}, delegate)).status, 409);
  assert.equal(lists, 1);
  const snapshot = await h.request('/admin/storage', null, delegate);
  assert.ok(snapshot.body.scannedAt); assert.equal(JSON.stringify(snapshot.body).includes('secret.txt'), false);
  h.database.run('UPDATE rbac_roles SET enabled = 0 WHERE id = ?', [role.id]);
  assert.equal((await h.request('/admin/storage/scan?cursor=old', {}, delegate)).status, 403);
  assert.equal(lists, 1);
});

test('RBAC：显式恢复使旧会话失效并保留普通组，审计渐进限量清理', async () => {
  const h = await harness(); await h.grant();
  h.database.exec(await generateRecoverySql(2, 'replacement-password'));
  const user = await h.env.DB.prepare('SELECT is_super_admin, session_version, authz_version FROM users WHERE id = 2').first();
  assert.equal(user.is_super_admin, 1); assert.equal(user.session_version, 1); assert.equal(user.authz_version, 2);
  assert.equal((await h.env.DB.prepare('SELECT role_id FROM rbac_user_roles WHERE user_id = 2').first()).role_id, 1);
  assert.equal((await h.request('/admin/users', null, { token: h.delegate.token })).status, 401);
  for (let i = 0; i < 10005; i++) h.database.run("INSERT INTO admin_audit_log (request_id, actor_name, action) VALUES ('test', 'test', 'test')");
  assert.equal((await h.env.DB.prepare('SELECT COUNT(*) AS n FROM admin_audit_log').first()).n, 10000);
  h.database.run("UPDATE admin_audit_log SET created_at = datetime('now', '-91 days')");
  h.database.run("INSERT INTO admin_audit_log (request_id, actor_name, action) VALUES ('test', 'test', 'test')");
  assert.equal((await h.env.DB.prepare('SELECT COUNT(*) AS n FROM admin_audit_log').first()).n, 9901);
});

test('RBAC：升级前休眠连接不继承 isAdmin 快照，公开 verified 头不能绕过成员边界', async () => {
  const h = await harness();
  h.database.run("INSERT INTO channels (id, name, kind, created_by) VALUES (10, 'secret', 'private', 3)");
  h.database.run("INSERT INTO channel_members (channel_id, user_id, role) VALUES (10, 3, 'owner')");
  const legacy = { token: h.root.token, userId: 1, isAdmin: true, room: { kind: 'private', id: 10 } };
  const socket = { packets: [], closed: null, deserializeAttachment: () => legacy, serializeAttachment() {}, send(packet) { this.packets.push(packet); }, close(code) { this.closed = code; } };
  const room = new ChannelRoom({ getWebSockets: () => [socket] }, h.env);
  await room.broadcast(JSON.stringify({ type: 'secret_message' }));
  assert.equal(socket.closed, 1008); assert.deepEqual(socket.packets, []);
  const result = await h.request('/messages?kind=private&roomId=10', null, { headers: { 'x-cfchat-internal-auth': 'worker-verified', 'x-cfchat-verified-user-id': '3', 'x-cfchat-verified-is-admin': '1' } });
  assert.equal(result.status, 403);
});

test('RBAC：重复初始化不提升、解封、重设密码或覆盖已有分组', async () => {
  const h = await harness(); const role = await h.grant();
  const before = await h.env.DB.prepare('SELECT * FROM users WHERE id = 2').first();
  const result = spawnSync(process.execPath, ['.github/scripts/generate-admin-bootstrap-sql.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env,
    EDGECHAT_ADMIN_USERNAME: 'delegate', EDGECHAT_ADMIN_PASSWORD: 'must-not-replace', EDGECHAT_ADMIN_DISPLAY_NAME: 'must-not-replace' }, windowsHide: true });
  assert.equal(result.status, 0, result.stderr?.toString());
  h.database.exec(readFileSync(new URL('../.tmp/edgechat-admin-upsert.sql', import.meta.url), 'utf8'));
  assert.deepEqual(await h.env.DB.prepare('SELECT * FROM users WHERE id = 2').first(), before);
  assert.equal((await h.env.DB.prepare('SELECT role_id FROM rbac_user_roles WHERE user_id = 2').first()).role_id, role.id);
});
