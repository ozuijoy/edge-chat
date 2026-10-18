import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import initSqlJs from 'sql.js';
import { generateBootstrapSql, verifyAdminBootstrap } from '../.github/scripts/generate-admin-bootstrap-sql.mjs';
import worker from '../worker/src/index.js';
import { hashPassword, verifyPassword } from '../worker/src/auth.js';
import { createD1Adapter, createKvAdapter } from './support/d1.js';

const SQL = await initSqlJs();
const schema = readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8');

function harness() {
  const database = new SQL.Database();
  database.exec(schema);
  const env = { DB: createD1Adapter(database), SESSIONS: createKvAdapter() };
  const query = async (sql) => (await env.DB.prepare(sql).all()).results;
  async function request(path, body, token = '') {
    return worker.fetch(new Request(`https://bootstrap.test/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }), env, { waitUntil(promise) { promise.catch(() => {}); } });
  }
  return { database, env, query, request };
}

test('首次安装：只有 schema 无法登录，初始化后能登录、访问后台并创建注册邀请', async () => {
  const h = harness();
  const credentials = { username: 'admin', password: 'operator-chosen-password' };
  assert.equal((await h.request('/auth/login', credentials)).status, 401);
  await assert.rejects(verifyAdminBootstrap(h.query), /No active super administrator/);
  h.database.exec(await generateBootstrapSql(credentials));
  await verifyAdminBootstrap(h.query);
  const login = await h.request('/auth/login', credentials);
  assert.equal(login.status, 200);
  const { token, session } = await login.json();
  assert.equal(session.isSuperAdmin, true);
  assert.equal(session.canAccessAdmin, true);
  assert.equal((await h.request('/admin/overview', null, token)).status, 200);
  assert.equal((await h.request('/admin/register-links', { maxUses: 1 }, token)).status, 200);
  assert.equal((await h.env.DB.prepare('SELECT role_id FROM rbac_user_roles WHERE user_id = ?').bind(session.userId).first()).role_id, 1);
  assert.equal((await h.env.DB.prepare('SELECT role FROM channel_members WHERE user_id = ?').bind(session.userId).first()).role, 'member');
  assert.equal((await h.request('/auth/login', { ...credentials, password: 'wrong' })).status, 401);
});

test('初始化 SQL 转义用户名和显示名，密码只保留随机盐和哈希', async () => {
  const h = harness();
  const credentials = { username: "root'one", displayName: "Owner's site", password: 'secret-not-in-generated-sql' };
  const sql = await generateBootstrapSql(credentials);
  assert.ok(!sql.includes(credentials.password));
  h.database.exec(sql);
  const user = await h.env.DB.prepare('SELECT * FROM users').first();
  assert.equal(user.username, credentials.username);
  assert.equal(user.display_name, credentials.displayName);
  assert.equal(await verifyPassword(credentials.password, user.password_hash, user.password_salt), true);
});

test('重复初始化保留现有密码及身份，不会创建重复账号', async () => {
  const h = harness();
  h.database.exec(await generateBootstrapSql({ username: 'admin', password: 'original' }));
  const before = await h.query('SELECT * FROM users');
  h.database.exec(await generateBootstrapSql({ username: 'admin', password: 'replacement', displayName: 'changed' }));
  assert.deepEqual(await h.query('SELECT * FROM users'), before);
  await verifyAdminBootstrap(h.query);
});

test('同名普通账号不能经初始化被提权或重置密码', async () => {
  const h = harness();
  const hashed = await hashPassword('existing-password');
  h.database.run('INSERT INTO users (username, display_name, password_hash, password_salt) VALUES (?, ?, ?, ?)', ['admin', 'existing', hashed.hash, hashed.salt]);
  const before = await h.query('SELECT * FROM users');
  h.database.exec(await generateBootstrapSql({ username: 'admin', password: 'replacement' }));
  assert.deepEqual(await h.query('SELECT * FROM users'), before);
  await assert.rejects(verifyAdminBootstrap(h.query), /explicit recovery/);
});

for (const [state, fields, valid] of [
  ['普通账号', '0, 0, NULL, NULL', false],
  ['永久封禁超管', '1, 1, NULL, NULL', false],
  ['临时封禁超管', "1, 0, datetime('now', '+1 hour'), NULL", false],
  ['软删除超管', "1, 0, NULL, CURRENT_TIMESTAMP", false],
  ['封禁到期超管', "1, 0, datetime('now', '-1 hour'), NULL", true],
]) {
  test(`部署校验：${state}`, async () => {
    const h = harness();
    h.database.run(`INSERT INTO users (username, display_name, password_hash, password_salt, is_super_admin, is_disabled, disabled_until, deleted_at)
      VALUES ('operator', 'operator', 'hash', 'salt', ${fields})`);
    if (valid) await verifyAdminBootstrap(h.query);
    else await assert.rejects(verifyAdminBootstrap(h.query), /No active super administrator/);
  });
}

test('初始化缺少任一凭据时给出明确配置名，数据库查询失败不会被当作已初始化', async () => {
  await assert.rejects(generateBootstrapSql({ username: '', password: 'provided' }), /EDGECHAT_ADMIN_USERNAME/);
  await assert.rejects(generateBootstrapSql({ username: 'admin', password: '' }), /EDGECHAT_ADMIN_PASSWORD/);
  await assert.rejects(verifyAdminBootstrap(async () => { throw new Error('D1 unavailable'); }), /D1 unavailable/);
});
