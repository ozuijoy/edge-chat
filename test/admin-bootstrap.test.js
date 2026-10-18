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

test('首次安裝：只有 schema 無法登錄，初始化後能登錄、訪問後臺並創建註冊邀請', async () => {
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

test('初始化 SQL 轉義用戶名和顯示名，密碼只保留隨機鹽和哈希', async () => {
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

test('重複初始化保留現有密碼及身份，不會創建重複賬號', async () => {
  const h = harness();
  h.database.exec(await generateBootstrapSql({ username: 'admin', password: 'original' }));
  const before = await h.query('SELECT * FROM users');
  h.database.exec(await generateBootstrapSql({ username: 'admin', password: 'replacement', displayName: 'changed' }));
  assert.deepEqual(await h.query('SELECT * FROM users'), before);
  await verifyAdminBootstrap(h.query);
});

test('同名普通賬號不能經初始化被提權或重置密碼', async () => {
  const h = harness();
  const hashed = await hashPassword('existing-password');
  h.database.run('INSERT INTO users (username, display_name, password_hash, password_salt) VALUES (?, ?, ?, ?)', ['admin', 'existing', hashed.hash, hashed.salt]);
  const before = await h.query('SELECT * FROM users');
  h.database.exec(await generateBootstrapSql({ username: 'admin', password: 'replacement' }));
  assert.deepEqual(await h.query('SELECT * FROM users'), before);
  await assert.rejects(verifyAdminBootstrap(h.query), /explicit recovery/);
});

for (const [state, fields, valid] of [
  ['普通賬號', '0, 0, NULL, NULL', false],
  ['永久封禁超管', '1, 1, NULL, NULL', false],
  ['臨時封禁超管', "1, 0, datetime('now', '+1 hour'), NULL", false],
  ['軟刪除超管', "1, 0, NULL, CURRENT_TIMESTAMP", false],
  ['封禁到期超管', "1, 0, datetime('now', '-1 hour'), NULL", true],
]) {
  test(`部署校驗：${state}`, async () => {
    const h = harness();
    h.database.run(`INSERT INTO users (username, display_name, password_hash, password_salt, is_super_admin, is_disabled, disabled_until, deleted_at)
      VALUES ('operator', 'operator', 'hash', 'salt', ${fields})`);
    if (valid) await verifyAdminBootstrap(h.query);
    else await assert.rejects(verifyAdminBootstrap(h.query), /No active super administrator/);
  });
}

test('初始化缺少任一憑據時給出明確配置名，數據庫查詢失敗不會被當作已初始化', async () => {
  await assert.rejects(generateBootstrapSql({ username: '', password: 'provided' }), /EDGECHAT_ADMIN_USERNAME/);
  await assert.rejects(generateBootstrapSql({ username: 'admin', password: '' }), /EDGECHAT_ADMIN_PASSWORD/);
  await assert.rejects(verifyAdminBootstrap(async () => { throw new Error('D1 unavailable'); }), /D1 unavailable/);
});
