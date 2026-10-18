import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { compileScript, parse } from '@vue/compiler-sfc';
import { ref } from 'vue';
import initSqlJs from 'sql.js';
import worker from '../worker/src/index.js';
import { createSession } from '../worker/src/auth.js';
import { getUserByUsername } from '../worker/src/data/users.js';
import { getSiteSettings, updateSiteSettings } from '../worker/src/data/site-settings.js';
import { createD1Adapter, createKvAdapter } from './support/d1.js';
import { isSiteColorTheme, normalizeSiteColorTheme } from '../shared/site-theme.ts';
import { applySiteColorTheme } from '../frontend/src/site-theme.ts';
import { requestDemo } from '../frontend/src/demo/api.js';
import { resetDemoState } from '../frontend/src/demo/state.js';

const SQL = await initSqlJs();
const schema = readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8');

async function harness() {
  const database = new SQL.Database();
  database.exec(schema);
  for (const name of ['root', 'reader', 'editor', 'regular']) {
    database.run(`INSERT INTO users (username, display_name, password_hash, password_salt, is_super_admin)
      VALUES (?, ?, 'hash', 'salt', ?)`, [name, name, name === 'root' ? 1 : 0]);
  }
  database.run("INSERT INTO rbac_roles (id, key, name) VALUES (2, 'readers', 'readers'), (3, 'editors', 'editors')");
  database.run("INSERT INTO rbac_role_permissions VALUES (2, 'site.read'), (3, 'site.read'), (3, 'site.appearance.update')");
  database.run('UPDATE rbac_user_roles SET role_id = 2 WHERE user_id = 2');
  database.run('UPDATE rbac_user_roles SET role_id = 3 WHERE user_id = 3');
  const env = { DB: createD1Adapter(database), SESSIONS: createKvAdapter() };
  const tokens = {};
  for (const name of ['root', 'reader', 'editor', 'regular']) {
    tokens[name] = (await createSession(env, await getUserByUsername(env.DB, name))).token;
  }
  async function request(body, name = 'root', path = '/api/admin/site-settings') {
    const response = await worker.fetch(new Request(`https://theme.test${path}`, {
      method: body === undefined ? 'GET' : 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(tokens[name] ? { Authorization: `Bearer ${tokens[name]}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }), env, { waitUntil() {} });
    return { status: response.status, body: await response.json() };
  }
  return { database, db: env.DB, request };
}

test('配色白名单与旧站点回退：只接受预设，不把任意值带进 DOM', () => {
  const root = { dataset: {} };
  for (const value of [undefined, null, '', 'pink', {}, ['cream-sakura'], '<style>']) {
    assert.equal(isSiteColorTheme(value), false);
    assert.equal(normalizeSiteColorTheme(value), 'default');
    applySiteColorTheme(value, root);
    assert.equal(root.dataset.colorTheme, 'default');
  }
  applySiteColorTheme('cream-sakura', root);
  assert.equal(root.dataset.colorTheme, 'cream-sakura');
  applySiteColorTheme('default', root);
  assert.equal(root.dataset.colorTheme, 'default');
});

test('真实 D1：旧库默认不写入，主题持久化、恢复与名称/图标部分更新相互独立', async () => {
  const h = await harness();
  assert.equal((await getSiteSettings(h.db)).colorTheme, 'default');
  assert.equal(h.database.exec("SELECT * FROM site_settings WHERE setting_key = 'site_color_theme'").length, 0);
  await updateSiteSettings(h.db, { siteName: 'Keep name', siteIconUrl: 'https://cdn.example/icon.png' });
  const changed = await h.request({ colorTheme: 'cream-sakura' }, 'editor');
  assert.equal(changed.status, 200);
  assert.deepEqual(changed.body.site, { siteName: 'Keep name', siteIconUrl: 'https://cdn.example/icon.png', colorTheme: 'cream-sakura' });
  assert.equal((await h.request(undefined, '', '/api/site')).body.site.colorTheme, 'cream-sakura');
  const reopened = new SQL.Database(h.database.export());
  assert.equal((await getSiteSettings(createD1Adapter(reopened))).colorTheme, 'cream-sakura');
  reopened.close();
  assert.equal((await h.request({ siteName: 'New name' })).body.site.colorTheme, 'cream-sakura');
  assert.equal((await h.request({ colorTheme: 'default' })).body.site.siteIconUrl, 'https://cdn.example/icon.png');
  assert.equal((await getSiteSettings(h.db)).colorTheme, 'default');
  assert.ok(h.database.exec("SELECT * FROM admin_audit_log WHERE action = 'site.update'")[0].values.length >= 3);
});

test('配色 API：拒绝非法值、匿名、普通用户、只读管理员与额外字段，失败无部分写入', async () => {
  const h = await harness();
  const initial = await getSiteSettings(h.db);
  for (const colorTheme of [null, '', 'pink', {}, ['cream-sakura']]) {
    const result = await h.request({ siteName: 'Must not save', colorTheme });
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: '不支持的站点配色' });
  }
  for (const name of ['', 'regular', 'reader']) {
    const result = await h.request({ colorTheme: 'cream-sakura' }, name);
    assert.equal(result.status, name ? 403 : 401);
  }
  assert.equal((await h.request({ colorTheme: 'cream-sakura', stealthEnabled: true })).status, 400);
  assert.equal((await h.request({ colorTheme: 'cream-sakura', siteName: '' })).status, 400);
  assert.deepEqual(await getSiteSettings(h.db), initial);
});

test('demo 配色遵循相同部分更新与白名单，重置仅恢复演示状态', async () => {
  resetDemoState();
  const initial = (await requestDemo('/site')).site;
  const patch = body => requestDemo('/admin/site-settings', { method: 'PATCH', body });
  assert.deepEqual((await patch({ colorTheme: 'cream-sakura' })).site, { ...initial, colorTheme: 'cream-sakura' });
  assert.equal((await patch({ siteName: 'Preview' })).site.colorTheme, 'cream-sakura');
  await assert.rejects(patch({ colorTheme: 'invalid' }), /不支持的站点配色/);
  resetDemoState();
  assert.deepEqual((await requestDemo('/site')).site, initial);
});

const { descriptor } = parse(readFileSync(new URL('../frontend/src/components/admin/AdminSiteTheme.vue', import.meta.url), 'utf8'));
const { scriptSetupAst } = compileScript(descriptor, { id: 'site-theme-test' });
const setup = scriptSetupAst.filter(node => node.type !== 'ImportDeclaration')
  .map(node => descriptor.scriptSetup.content.slice(node.start, node.end)).join('\n');
function themeControl({ update, allowed = true } = {}) {
  const requests = [];
  const store = { site: { siteName: 'Saved', siteIconUrl: '', colorTheme: 'default' }, setSite(site) { this.site = site; } };
  const control = runInNewContext(`${setup}\n({selectTheme, saving, saved, error})`, {
    ref, defineProps() {}, defineEmits: () => () => {}, can: () => allowed, store,
    api: { async updateAdminSiteSettings(body) {
      requests.push({ ...body });
      return update ? update(body) : { site: { ...store.site, ...body } };
    } }
  });
  return { ...control, requests, store };
}

test('真实 Vue 配色逻辑：一次点击只提交配色，成功后应用，重复点击不提交', async () => {
  const c = themeControl();
  await c.selectTheme('cream-sakura');
  assert.deepEqual(c.requests, [{ colorTheme: 'cream-sakura' }]);
  assert.equal(c.store.site.colorTheme, 'cream-sakura');
  assert.equal(c.saved.value, true);
  await c.selectTheme('cream-sakura');
  assert.equal(c.requests.length, 1);
  await c.selectTheme('default');
  assert.equal(c.store.site.colorTheme, 'default');
  assert.match(descriptor.template.content, /:aria-pressed=/);
  assert.match(descriptor.template.content, /role="status"/);
});

test('真实 Vue 配色逻辑：保存中锁定、失败保留原主题，允许重试；只读不能提交', async () => {
  let reject;
  const c = themeControl({ update: () => new Promise((_resolve, fail) => { reject = fail; }) });
  const pending = c.selectTheme('cream-sakura');
  await c.selectTheme('cream-sakura');
  assert.equal(c.requests.length, 1);
  reject(new Error('save failed'));
  await pending;
  assert.equal(c.store.site.colorTheme, 'default');
  assert.equal(c.error.value, 'save failed');
  assert.equal(c.saving.value, '');
  assert.equal(c.saved.value, false);
  const retry = c.selectTheme('cream-sakura');
  assert.equal(c.requests.length, 2);
  reject(new Error('retry failed'));
  await retry;
  const reader = themeControl({ allowed: false });
  await reader.selectTheme('cream-sakura');
  assert.equal(reader.requests.length, 0);
});
