import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import initSqlJs from 'sql.js';
import worker from '../worker/src/index.js';
import { createSession, hashPassword } from '../worker/src/auth.js';
import { recordLoginInfo } from '../worker/src/data/user-login-info.ts';
import { submitGate } from '../worker/src/stealth/gate.ts';
import { createGateAppearance, renderGate } from '../worker/src/stealth/appearance.ts';
import { describeUserAgent } from '../frontend/src/admin/user-agent.ts';
import { createD1Adapter, createKvAdapter } from './support/d1.js';

const SQL = await initSqlJs();
const schema = readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8');
const password = await hashPassword('password');
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function harness() {
  const database = new SQL.Database();
  database.exec(schema);
  for (const name of ['admin', 'alice', 'unused']) {
    database.run('INSERT INTO users (username, display_name, password_hash, password_salt, is_super_admin) VALUES (?, ?, ?, ?, ?)',
      [name, name, password.hash, password.salt, name === 'admin' ? 1 : 0]);
  }
  const env = { DB: createD1Adapter(database), SESSIONS: createKvAdapter() };
  const admin = await createSession(env, { id: 1, username: 'admin', display_name: 'admin', is_super_admin: 1, session_version: 0 });
  const alice = await createSession(env, { id: 2, username: 'alice', display_name: 'alice', session_version: 0 });
  async function request(path, { token = admin.token, body, headers = {}, method = body ? 'POST' : 'GET' } = {}) {
    const response = await worker.fetch(new Request(`https://edgechat.test/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }), env, {});
    return { response, payload: await response.json() };
  }
  return { database, env, request, alice };
}

test('登录信息：管理员限定、按需响应、未记录与删除/无效 ID', async () => {
  const { request, alice, database } = await harness();
  assert.equal((await request('/admin/users/2/details', { token: '' })).response.status, 401);
  assert.equal((await request('/admin/users/2/details', { token: alice.token })).response.status, 403);
  const result = await request('/admin/users/2/details');
  assert.equal(result.response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(result.payload.user.loginHistory, []);
  assert.deepEqual(Object.keys(result.payload.user).sort(), ['bio', 'createdAt', 'displayName', 'id', 'isAdmin', 'loginHistory', 'username']);
  for (const id of ['0', '-1', '1.5', '01', '1e0', '9007199254740992', '999']) {
    assert.equal((await request(`/admin/users/${id}/details`)).response.status, 404);
  }
  database.run('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = 2');
  assert.equal((await request('/admin/users/2/details')).response.status, 404);
  const list = await request('/admin/users');
  assert.equal(JSON.stringify(list.payload).includes('loginHistory'), false);
});

test('登录信息：失败不采集、只信 CF 来源、恢复会话不写库', async () => {
  const { request, database } = await harness();
  await request('/auth/login', { token: '', body: { username: 'alice', password: 'wrong' }, headers: { 'CF-Connecting-IP': '192.0.2.1' } });
  assert.equal(database.exec('SELECT count(*) FROM user_login_info')[0].values[0][0], 0);
  const first = await request('/auth/login', { token: '', body: { username: 'alice', password: 'password' }, headers: { 'CF-Connecting-IP': '192.0.2.1', 'User-Agent': ua } });
  assert.equal(first.response.status, 200);
  const original = (await request('/admin/users/2/details')).payload.user.loginHistory[0];
  await request('/auth/session', { token: first.payload.token });
  await request('/auth/login', { token: '', body: { username: 'alice', password: 'password', ip: 'fake' }, headers: { 'CF-Connecting-IP': '2001:db8::1', 'User-Agent': 'updated', 'X-Forwarded-For': 'fake' } });
  const history = (await request('/admin/users/2/details')).payload.user.loginHistory;
  const latest = history[0];
  assert.deepEqual(history[1], original);
  assert.equal(latest.ip, '2001:db8::1');
  assert.equal(latest.userAgent, 'updated');
  assert.equal(database.exec('SELECT count(*) FROM user_login_info')[0].values[0][0], 2);
  const unavailable = await request('/auth/login', { token: '', body: { username: 'unused', password: 'password' }, headers: { 'X-Forwarded-For': 'fake' } });
  assert.equal(unavailable.response.status, 200);
  assert.equal((await request('/admin/users/3/details')).payload.user.loginHistory[0].ip, '');
});

test('隐身与 v1 登录共用快照，UA 限长与账号硬删除级联清理', async () => {
  const { database, env, request } = await harness();
  const settings = { loginPath: '/login', formId: 'test', appearance: createGateAppearance() };
  const gate = await submitGate(new Request('https://edgechat.test/login', {
    method: 'POST', headers: { Origin: 'https://edgechat.test', 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '192.0.2.2', 'User-Agent': 'x'.repeat(2000) },
    body: 'username=alice&password=password',
  }), env, settings);
  assert.equal(gate.status, 303);
  assert.equal((await request('/admin/users/2/details')).payload.user.loginHistory[0].userAgent.length, 1024);
  const v1 = await request('/v1/auth/login', { token: '', body: { username: 'alice', password: 'password', device: { installationId: '00000000-0000-4000-8000-000000000001', name: 'test', appVersion: '1' } }, headers: { 'CF-Connecting-IP': '192.0.2.3' } });
  assert.equal(v1.response.status, 200);
  const history = (await request('/admin/users/2/details')).payload.user.loginHistory;
  assert.equal(history[1].ip, '192.0.2.2');
  assert.equal(history[0].ip, '192.0.2.3');
  database.run('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = 2');
  database.run('DELETE FROM channel_members WHERE user_id = 2');
  database.run('DELETE FROM device_sessions WHERE user_id = 2');
  database.run('DELETE FROM users WHERE id = 2');
  assert.equal(database.exec('SELECT count(*) FROM user_login_info')[0].values[0][0], 0);
});

test('辅助采集写入故障不暴露信息，也不阻断登录', async (context) => {
  const log = context.mock.method(console, 'error', () => {});
  await recordLoginInfo({ prepare() { throw new Error('private SQL'); } }, 1, new Request('https://edgechat.test'));
  assert.deepEqual(log.mock.calls[0].arguments, ['user_login_info_write_failed']);
});

test('浏览器推断使用按需解析器，不把缩减 UA 当作真实型号', () => {
  assert.deepEqual(describeUserAgent(''), { browser: '', system: '', model: '' });
  assert.equal(describeUserAgent(ua).browser, 'Chrome 140.0.0.0');
  assert.equal(describeUserAgent(ua).system, 'Windows NT 10.0');
  assert.equal(describeUserAgent(ua).model, '');
  assert.equal(describeUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36').model, '');
  assert.equal(describeUserAgent('Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD1) AppleWebKit/537.36 Chrome/90.0.0.0 Mobile Safari/537.36').model, 'Pixel 2');
});

test('用户详情分包、生命周期与三语言文案契约', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const page = read('frontend/src/pages/AdminUsersPage.vue');
  const dialog = read('frontend/src/components/admin/UserDetailsDialog.vue');
  assert.match(page, /defineAsyncComponent\(\(\) => import\('\.\.\/components\/admin\/UserDetailsDialog.vue'\)\)/);
  assert.match(page, /v-if="detailsOpened"/);
  assert.doesNotMatch(page, /import.*(?:bowser|user-agent)/);
  assert.match(dialog, /useOverlayLifecycle/);
  assert.match(dialog, /controller\?\.abort\(\)/);
  assert.match(dialog, /current === generation/);
  assert.match(dialog, /role="dialog"/);
  for (const locale of ['zh-CN', 'zh-TW', 'en-US']) {
    const source = read(`frontend/src/locales/${locale}.js`);
    assert.match(source, /users.details.webrtcIps/);
    assert.match(source, /users.details.history/);
    assert.doesNotMatch(source, /users.details.limitations|auth.loginPrivacy|users.details.webrtcStatus/);
  }
  assert.doesNotMatch(dialog, /users.details.limitations/);
  assert.doesNotMatch(dialog, /webrtcStatus|firstIp|firstLoginAt/);
  assert.match(dialog, /<details v-if="details.loginHistory.length > 1"/);
  assert.match(dialog, /historyOpen = ref\(false\)/);
  assert.doesNotMatch(read('frontend/src/pages/LoginPage.vue'), /login-privacy|auth.loginPrivacy/);
  assert.doesNotMatch(renderGate({ loginPath: '/login', formId: 'test', appearance: createGateAppearance() }, false), /record source IP|<script/);
});

test('WebRTC 上报：认证、参数校验、一次消费、对应登录隔离及限时', async () => {
  const { request, database, alice } = await harness();
  const login = async () => (await request('/auth/login', { token: '', body: { username: 'alice', password: 'password' } })).payload;
  const first = await login();
  const body = { probeId: first.session.loginProbeId, status: 'completed', ips: ['192.0.2.10', '192.0.2.10', '2001:db8::10'] };
  const report = (token, value = body) => request('/auth/login-network', { token, body: value });
  assert.equal((await report('')).response.status, 401);
  assert.equal((await report(alice.token)).response.status, 403);
  assert.equal((await report(first.token, { ...body, probeId: 'fake' })).response.status, 403);
  for (const value of [
    { ...body, status: 'unknown' }, { ...body, ips: '192.0.2.10' },
    { ...body, ips: [1] }, { ...body, ips: ['999.1.1.1'] },
    { ...body, ips: ['test.local'] }, { ...body, ips: ['<script>'] },
    { ...body, ips: Array(5).fill('192.0.2.10') },
    { ...body, status: 'unsupported' }, { ...body, status: 'failed' },
  ]) assert.equal((await report(first.token, value)).response.status, 400);
  assert.equal((await report(first.token)).response.status, 200);
  let info = (await request('/admin/users/2/details')).payload.user.loginHistory[0];
  assert.deepEqual(info.webrtcIps, ['192.0.2.10', '2001:db8::10']);
  assert.equal(Object.hasOwn(info, 'webrtcStatus'), false);
  assert.ok(info.webrtcCheckedAt);
  await report(first.token, { ...body, ips: ['192.0.2.11'] });
  assert.deepEqual((await request('/admin/users/2/details')).payload.user.loginHistory[0], info);
  const second = await login();
  assert.notEqual(second.session.loginProbeId, first.session.loginProbeId);
  await report(first.token);
  info = (await request('/admin/users/2/details')).payload.user.loginHistory[0];
  assert.deepEqual(info.webrtcIps, []);
  assert.equal(info.webrtcCheckedAt, null);
  const secondBody = { probeId: second.session.loginProbeId, status: 'timeout', ips: [] };
  database.run("UPDATE user_login_info SET login_at = datetime('now', '-3 minutes') WHERE id = ?", [info.id]);
  await report(second.token, secondBody);
  assert.equal((await request('/admin/users/2/details')).payload.user.loginHistory[0].webrtcCheckedAt, null);
  database.run('UPDATE user_login_info SET login_at = CURRENT_TIMESTAMP WHERE id = ?', [info.id]);
  await report(second.token, secondBody);
  assert.ok((await request('/admin/users/2/details')).payload.user.loginHistory[0].webrtcCheckedAt);
});

test('三次保留：连续和同秒登录仅留最后三条，账号独立，历史数据整体淘汰', async () => {
  const { request, database } = await harness();
  for (let i = 1; i <= 8; i++) {
    const { payload } = await request('/auth/login', { token: '', body: { username: 'alice', password: 'password' },
      headers: { 'CF-Connecting-IP': `192.0.2.${i}`, 'User-Agent': `browser-${i}` } });
    await request('/auth/login-network', { token: payload.token, body: { probeId: payload.session.loginProbeId, status: 'completed', ips: [`2001:db8::${i}`] } });
    const rows = database.exec('SELECT count(*) FROM user_login_info WHERE user_id = 2')[0].values[0][0];
    assert.equal(rows, Math.min(i, 3));
  }
  const records = (await request('/admin/users/2/details')).payload.user.loginHistory;
  assert.deepEqual(records.map((r) => r.ip), ['192.0.2.8', '192.0.2.7', '192.0.2.6']);
  assert.deepEqual(records.map((r) => r.userAgent), ['browser-8', 'browser-7', 'browser-6']);
  assert.deepEqual(records.map((r) => r.webrtcIps), [['2001:db8::8'], ['2001:db8::7'], ['2001:db8::6']]);
  assert.ok(records.every((r) => r.loginAt && r.webrtcCheckedAt));
  await request('/auth/login', { token: '', body: { username: 'unused', password: 'password' } });
  assert.equal(database.exec('SELECT count(*) FROM user_login_info')[0].values[0][0], 4);
  assert.deepEqual((await request('/admin/users/2/details')).payload.user.loginHistory, records);
  database.run('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = 2');
  database.run('DELETE FROM channel_members WHERE user_id = 2');
  database.run('DELETE FROM users WHERE id = 2');
  assert.equal(database.exec('SELECT count(*) FROM user_login_info')[0].values[0][0], 1);
});

test('WebRTC 历史：迟到补充只更新对应登录，淘汰后上报不复活记录', async () => {
  const { request, database } = await harness();
  const login = async (ip) => (await request('/auth/login', { token: '', body: { username: 'alice', password: 'password' }, headers: { 'CF-Connecting-IP': ip } })).payload;
  const first = await login('192.0.2.1');
  const second = await login('192.0.2.2');
  const report = () => request('/auth/login-network', { token: first.token,
    body: { probeId: first.session.loginProbeId, status: 'completed', ips: ['192.0.2.10'] } });
  await report();
  let records = (await request('/admin/users/2/details')).payload.user.loginHistory;
  assert.deepEqual(records[0].webrtcIps, []);
  assert.deepEqual(records[1].webrtcIps, ['192.0.2.10']);
  await login('192.0.2.3');
  await login('192.0.2.4');
  await report();
  records = (await request('/admin/users/2/details')).payload.user.loginHistory;
  assert.deepEqual(records.map((r) => r.ip), ['192.0.2.4', '192.0.2.3', '192.0.2.2']);
  assert.equal(database.exec('SELECT count(*) FROM user_login_info')[0].values[0][0], 3);
  assert.ok(second.session.loginProbeId);
});

test('三次保留：数据库直接插入也自动淘汰，并限定每条信息长度', async () => {
  const { database } = await harness();
  for (let i = 0; i < 100; i++) {
    database.run("INSERT INTO user_login_info (user_id, ip, user_agent, login_at) VALUES (?, ?, ?, '2026-10-05 00:00:00')", [2, `192.0.2.${i}`, 'x'.repeat(1024)]);
  }
  assert.equal(database.exec('SELECT count(*) FROM user_login_info')[0].values[0][0], 3);
  assert.deepEqual(database.exec('SELECT ip FROM user_login_info ORDER BY id DESC')[0].values, [['192.0.2.99'], ['192.0.2.98'], ['192.0.2.97']]);
  const bytes = database.export().byteLength;
  for (let i = 100; i < 1000; i++) database.run('INSERT INTO user_login_info (user_id, ip, user_agent) VALUES (?, ?, ?)', [2, `192.0.2.${i % 255}`, 'x'.repeat(1024)]);
  assert.equal(database.exec('SELECT count(*) FROM user_login_info')[0].values[0][0], 3);
  assert.equal(database.export().byteLength, bytes);
  for (const [column, value] of [['ip', 'x'.repeat(65)], ['user_agent', 'x'.repeat(1025)],
    ['webrtc_ips', JSON.stringify(Array(5).fill('192.0.2.1'))], ['webrtc_ips', '{}']]) {
    assert.throws(() => database.run(`UPDATE user_login_info SET ${column} = ? WHERE user_id = 2`, [value]), /CHECK/);
  }
});

test('历史迁移：保存可用首末信息、无重复首条、无虚构 UA、移除旧快照', async () => {
  const { database } = await harness();
  database.run('DROP TRIGGER limit_user_login_info');
  database.run('DROP TABLE user_login_info');
  const readMigration = (name) => readFileSync(new URL(`../worker/migrations/${name}.sql`, import.meta.url), 'utf8');
  database.exec(readMigration('2026-10-05-user-login-info'));
  database.exec(readMigration('2026-10-05-user-webrtc'));
  database.run(`INSERT INTO user_login_info (user_id, first_ip, first_login_at, last_ip, last_login_at, user_agent,
    login_probe_id, webrtc_ips, webrtc_status, webrtc_checked_at) VALUES (2, '192.0.2.1', '2026-10-01 00:00:00',
    '192.0.2.2', '2026-10-05 00:00:00', 'latest browser', 'probe-id', '["192.0.2.3"]', 'completed', '2026-10-05 00:00:01')`);
  database.run(`INSERT INTO user_login_info (user_id, first_ip, first_login_at, last_ip, last_login_at, user_agent)
    VALUES (3, '192.0.2.4', '2026-10-05 00:00:00', '192.0.2.4', '2026-10-05 00:00:00', 'same browser')`);
  database.exec(readMigration('2026-10-05-users-login-history'));
  const rows = database.exec('SELECT user_id, ip, user_agent, webrtc_ips FROM user_login_info ORDER BY id')[0].values;
  assert.deepEqual(rows, [[2, '192.0.2.1', '', '[]'], [2, '192.0.2.2', 'latest browser', '["192.0.2.3"]'], [3, '192.0.2.4', 'same browser', '[]']]);
  assert.equal(database.exec("SELECT name FROM sqlite_master WHERE name = 'user_login_info_legacy'").length, 0);
  for (let i = 5; i < 8; i++) database.run('INSERT INTO user_login_info (user_id, ip, user_agent) VALUES (2, ?, ?)', [`192.0.2.${i}`, 'new']);
  assert.deepEqual(database.exec('SELECT ip FROM user_login_info WHERE user_id = 2 ORDER BY id DESC')[0].values, [['192.0.2.7'], ['192.0.2.6'], ['192.0.2.5']]);
});
