import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import initSqlJs from 'sql.js';
import worker from '../worker/src/index.js';
import { createD1Adapter, createKvAdapter } from './support/d1.js';
import { createSession, hashPassword } from '../worker/src/auth.js';
import { getStealthSettings, saveStealthSettings } from '../worker/src/data/stealth-settings.ts';
import { cookieRequestAllowed, cookieToken, sessionCookie } from '../worker/src/session-cookie.ts';
import { createSiteEntry } from '../worker/src/stealth/entry.ts';
import { gatePage } from '../worker/src/stealth/gate.ts';
import { appearanceOptions, createGateAppearance, isGateAppearance } from '../worker/src/stealth/appearance.ts';
import { saveTelegramBridgeConfig } from '../worker/src/data/telegram.js';

const SQL = await initSqlJs();
const schema = readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8');
const password = await hashPassword('test-password');
const origin = 'https://example.test';
const context = { waitUntil() {}, passThroughOnException() {} };

async function fixture(enabled = true) {
  const database = new SQL.Database();
  database.exec(schema);
  database.run(
    `INSERT INTO users (id, username, display_name, password_hash, password_salt, is_super_admin)
     VALUES (1, 'admin', 'Admin', ?, ?, 1), (2, 'member', 'Member', ?, ?, 0)`,
    [password.hash, password.salt, password.hash, password.salt],
  );
  const accessed = [];
  const env = {
    DB: createD1Adapter(database),
    SESSIONS: createKvAdapter(),
    EDGECHAT_ENCRYPTION_KEYRING: JSON.stringify({ activeKeyId: 'test', keys: { test: Buffer.alloc(32, 1).toString('base64') } }),
    ASSETS: {
      async fetch(request) {
        accessed.push(request.url);
        const path = new URL(request.url).pathname;
        const contentType = path.endsWith('.js') ? 'application/javascript' : 'text/html';
        return new Response('<html><head><title>EdgeChat</title></head><body>SPA</body></html>', {
          headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000', ETag: '"product"', Server: 'product' },
        });
      },
    },
  };
  const settings = enabled ? await saveStealthSettings(env.DB, true) : null;
  return {
    database, env, settings, accessed,
    async cookie(userId = 1) {
      const { results } = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).all();
      const session = await createSession(env, results[0]);
      return `__Host-session=${session.token}`;
    },
    request(path, init = {}) { return worker.fetch(new Request(origin + path, init), env, context); },
  };
}

test('隐身模式默认关闭，未配置时保留常规站点与登录 API', async () => {
  const f = await fixture(false);
  const put = f.env.SESSIONS.put.bind(f.env.SESSIONS);
  let sessionTtl;
  f.env.SESSIONS.put = async (key, value, options) => {
    sessionTtl = options.expirationTtl;
    await put(key, value, options);
  };
  assert.equal(await getStealthSettings(f.env.DB), null);
  assert.match(await (await f.request('/')).text(), /EdgeChat/);
  assert.equal((await f.request('/api/site')).status, 200);
  const response = await f.request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test-password' }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /__Host-session=.*HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
  assert.equal(sessionTtl, 2592000);
});

test('未认证网关无品牌、脚本、外部资源、manifest 或构建信息', async () => {
  const f = await fixture();
  const response = await f.request('/');
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<title>(Sign in|Log in|Account access|Welcome)<\/title>/);
  assert.match(html, /<form action="\/[A-Za-z0-9_-]+" method="post">/);
  assert.doesNotMatch(html, /edgechat|cfchat|cloudflare|vite|vue|websocket|manifest|<script|<link|assets|logo/i);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('referrer-policy'), 'same-origin');
  assert.equal(f.accessed.length, 0);
  const head = await f.request('/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('常见互联网探测路径、方法与无效凭据均得相同普通 404，不能触达 ASSETS', async () => {
  const f = await fixture();
  for (const path of ['/assets/main.js', '/assets/main.js.map', '/src/main.js', '/index.html',
    '/logo.svg', '/favicon.ico', '/manifest.json', '/sw.js', '/vendor/vditor/dist/js/lute/lute.min.js',
    '/api/health', '/api/site', '/api/auth/login', '/api/v1/capabilities',
    '/api/ws/public/1', '/api/inbox/ws', '/api/admin/maintenance',
    '/files/1/avatar.png', '/api/integrations/telegram/avatar/1', '/api/register-links/token',
    '/register/token', '/admin', '/unknown', `${f.settings.apiPrefix}/site`]) {
    const response = await f.request(path);
    assert.equal(response.status, 404, path);
    assert.equal(await response.text(), 'Not Found', path);
    assert.equal(response.headers.get('etag'), null);
    assert.equal(response.headers.get('server'), null);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  for (const method of ['POST', 'OPTIONS', 'PUT']) {
    const response = await f.request('/api/auth/login', { method });
    assert.equal(response.status, 404);
    assert.equal(await response.text(), 'Not Found');
  }
  assert.equal((await f.request('/assets/main.js', { headers: { cookie: '__Host-session=invalid' } })).status, 404);
  assert.equal(f.accessed.length, 0);
});

test('网关登录成功才能读正式页面、静态资源和随机 API，Cookie 不出现在 HTML', async () => {
  const f = await fixture();
  const response = await f.request(f.settings.loginPath, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=admin&password=test-password',
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/');
  assert.match(response.headers.get('set-cookie'), /Max-Age=2592000; Secure/);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const page = await f.request('/admin/stealth', { headers: { cookie } });
  const html = await page.text();
  assert.match(html, /<title>EdgeChat<\/title>/);
  assert.ok(html.includes(`<meta name="app-path" content="${f.settings.apiPrefix}">`));
  assert.ok(!html.includes(cookie.split('=')[1]));
  assert.equal(page.headers.get('cache-control'), 'private, no-store');
  assert.equal(page.headers.get('etag'), null);
  assert.equal((await f.request('/assets/main.js', { headers: { cookie } })).status, 200);
  const session = await f.request(`${f.settings.apiPrefix}/auth/session`, { headers: { cookie } });
  assert.equal((await session.json()).session.userId, 1);
  assert.equal((await f.request('/api/auth/session', { headers: { cookie } })).status, 200);
});

test('错误账号、错误密码、封禁账号只显示相同通用登录失败', async () => {
  const f = await fixture();
  const responses = [];
  for (const credentials of ['username=nobody&password=test-password', 'username=admin&password=wrong']) {
    const response = await f.request(f.settings.loginPath, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: credentials,
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
    responses.push(await response.text());
  }
  f.database.run('UPDATE users SET is_super_admin = 1 WHERE id = 2');
  f.database.run('UPDATE users SET is_disabled = 1 WHERE id = 1');
  const banned = await f.request(f.settings.loginPath, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=admin&password=test-password',
  });
  assert.equal(banned.status, 401);
  assert.equal(await banned.text(), responses[0]);
  assert.equal(responses[0], responses[1]);
});

test('网关拒绝跨站提交、错误编码与超限流请求，不产生会话', async () => {
  const f = await fixture();
  assert.equal((await f.request(f.settings.loginPath, {
    method: 'POST', headers: { Origin: 'https://other.test', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=admin&password=test-password',
  })).status, 404);
  assert.equal((await f.request(f.settings.loginPath, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: '{"username":"admin","password":"test-password"}',
  })).status, 400);
  assert.equal((await f.request(f.settings.loginPath, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=admin&password=${'x'.repeat(8192)}`,
  })).status, 400);
  assert.equal(f.env.SESSIONS.values.size, 0);
});

test('Cookie 写入与 WS 需要同源；有效 Bearer 客户端保持兼容', async () => {
  const cookie = '__Host-session=valid';
  assert.equal(cookieToken(new Request(origin, { headers: { cookie } })), 'valid');
  for (const headers of [{ cookie }, { cookie, Origin: 'https://other.test' }]) {
    assert.equal(cookieRequestAllowed(new Request(origin, { method: 'POST', headers })), false);
    assert.equal(cookieRequestAllowed(new Request(origin, { headers: { ...headers, Upgrade: 'websocket' } })), false);
  }
  assert.equal(cookieRequestAllowed(new Request(origin, { method: 'POST', headers: { cookie, Origin: origin } })), true);
  assert.equal(cookieRequestAllowed(new Request(origin, { method: 'POST', headers: { Authorization: 'Bearer token' } })), true);
  assert.match(sessionCookie(new Request(origin), ''), /Max-Age=0; Secure/);
});

test('会话撤销、封禁或 session_version 变化后不能继续读脚本与页面', async () => {
  for (const change of [
    (f) => f.env.SESSIONS.values.clear(),
    (f) => { f.database.run('UPDATE users SET is_super_admin = 1 WHERE id = 2'); f.database.run('UPDATE users SET is_disabled = 1 WHERE id = 1'); },
    (f) => f.database.run('UPDATE users SET session_version = session_version + 1 WHERE id = 1'),
  ]) {
    const f = await fixture();
    const cookie = await f.cookie();
    change(f);
    assert.equal((await f.request('/assets/main.js', { headers: { cookie } })).status, 404);
    assert.match(await (await f.request('/', { headers: { cookie } })).text(), /<form action=/);
  }
});

test('仅管理员可切换隐身开关，随机标识跨切换稳定，不同实例独立', async () => {
  const f = await fixture();
  const memberCookie = await f.cookie(2);
  assert.equal((await f.request('/api/admin/stealth', { headers: { cookie: memberCookie } })).status, 403);
  const cookie = await f.cookie();
  const denied = await f.request('/api/admin/stealth', {
    method: 'PUT', headers: { cookie, Origin: 'https://other.test', 'Content-Type': 'application/json' },
    body: '{"enabled":false}',
  });
  assert.equal(denied.status, 404);
  const response = await f.request('/api/admin/stealth', {
    method: 'PUT', headers: { cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: '{"enabled":false}',
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).enabled, false);
  assert.ok(response.headers.get('set-cookie'));
  const disabled = await getStealthSettings(f.env.DB);
  assert.equal(disabled.loginPath, f.settings.loginPath);
  assert.equal(disabled.enabled, false);
  assert.deepEqual(disabled.appearance, f.settings.appearance);
  assert.equal((await saveStealthSettings(f.env.DB, true)).apiPrefix, f.settings.apiPrefix);
  assert.deepEqual((await getStealthSettings(f.env.DB)).appearance, f.settings.appearance);
  const originalPage = await gatePage(f.settings).text();
  assert.equal(await gatePage(await getStealthSettings(f.env.DB)).text(), originalPage);
  const other = await fixture();
  assert.notEqual(f.settings.loginPath, other.settings.loginPath);
  assert.notEqual(f.settings.apiPrefix, other.settings.apiPrefix);
  assert.notEqual(f.settings.formId, other.settings.formId);
  assert.notDeepEqual(f.settings.appearance, other.settings.appearance);
});

test('旧实例自动保存页面组合，保留路径与开关；并发读取采用同一持久化结果', async () => {
  const f = await fixture();
  const { appearance, ...legacy } = f.settings;
  f.database.run("UPDATE site_settings SET setting_value = ? WHERE setting_key = 'stealth_mode'", [JSON.stringify(legacy)]);
  const upgraded = await Promise.all(Array.from({ length: 8 }, () => getStealthSettings(f.env.DB)));
  const stored = JSON.parse(f.database.exec("SELECT setting_value FROM site_settings WHERE setting_key = 'stealth_mode'")[0].values[0][0]);
  assert.ok(isGateAppearance(stored.appearance));
  for (const settings of upgraded) assert.deepEqual(settings, stored);
  const { appearance: nextAppearance, ...unchanged } = stored;
  assert.deepEqual(unchanged, legacy);
  const html = await (await f.request('/')).text();
  assert.equal(await (await f.request('/')).text(), html);
  assert.equal(await gatePage(await getStealthSettings(f.env.DB)).text(), html);
});

test('同时首次配置不会生成不同的实例页面或入口', async () => {
  const f = await fixture(false);
  const saved = await Promise.all(Array.from({ length: 8 }, () => saveStealthSettings(f.env.DB, true)));
  for (const settings of saved) assert.deepEqual(settings, saved[0]);
  assert.equal(saved[0].enabled, true);
});

test('损坏或越界页面配置只修复外观，不改入口；配置不作为任意 HTML 执行', async () => {
  const f = await fixture();
  const invalid = { ...f.settings, appearance: { ...f.settings.appearance, layout: 99, usernameId: '"><script>' } };
  assert.equal(isGateAppearance(invalid.appearance), false);
  f.database.run("UPDATE site_settings SET setting_value = ? WHERE setting_key = 'stealth_mode'", [JSON.stringify(invalid)]);
  const restored = await getStealthSettings(f.env.DB);
  assert.ok(isGateAppearance(restored.appearance));
  assert.equal(restored.loginPath, f.settings.loginPath);
  assert.equal(restored.enabled, true);
  const html = await gatePage({ ...restored, loginPath: '/"><script>', formId: '" onmouseover="bad' }).text();
  assert.doesNotMatch(html, /<script|id="" onmouseover/);
  assert.match(html, /&quot;/);
});

test('登出删除 KV Session 并清 Cookie，此后无法再次下载资源', async () => {
  const f = await fixture();
  const cookie = await f.cookie();
  const response = await f.request(`${f.settings.apiPrefix}/auth/logout`, { method: 'POST', headers: { cookie, Origin: origin } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await f.request('/assets/main.js', { headers: { cookie } })).status, 404);
});

test('Telegram 有效凭据照常回调，无凭据/伪造凭据只得到普通 404', async () => {
  const f = await fixture();
  await saveTelegramBridgeConfig(f.env, {
    botToken: '123456:test', webhookSecret: 'test-secret', botUsername: 'test_bot',
    webhookUrl: `${origin}/api/integrations/telegram/webhook`, updatedBy: 1,
  });
  for (const secret of ['', 'wrong', 'test-secret']) {
    const response = await f.request('/api/integrations/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}) },
      body: '{}',
    });
    assert.equal(response.status, secret === 'test-secret' ? 200 : 404);
    if (secret !== 'test-secret') assert.equal(await response.text(), 'Not Found');
  }
});

test('伪造跨实例请求不暴露协议错误，签名后的业务错误仍交还可信对端', async () => {
  const f = await fixture();
  const invalid = await f.request('/api/integrations/instance-bridge/v1', {
    method: 'POST', headers: { 'x-edgechat-signature': 'fake' }, body: '{}',
  });
  assert.equal(invalid.status, 404);
  assert.equal(await invalid.text(), 'Not Found');
  const entry = createSiteEntry(async () => new Response('signed error', { status: 409, headers: { 'x-edgechat-signature': 'verified-response' } }));
  const signed = await entry(new Request(`${origin}/api/integrations/instance-bridge/v1`, {
    method: 'POST', headers: { 'x-edgechat-signature': 'request' },
  }), f.env, context);
  assert.equal(signed.status, 409);
  assert.equal(await signed.text(), 'signed error');
});

test('设置读取异常时 fail closed，不公开 SPA 或内部错误', async () => {
  const f = await fixture();
  f.env.DB = { prepare() { throw new Error('secret SQL stack'); } };
  const previous = console.error;
  console.error = () => {};
  try {
    const response = await f.request('/');
    assert.equal(response.status, 503);
    assert.equal(await response.text(), 'Service Unavailable');
    assert.equal(f.accessed.length, 0);
  } finally { console.error = previous; }
});

test('页面模块的两两组合保持小体积、无外部资源、固定表单能力和通用错误', async () => {
  const f = await fixture();
  const entries = Object.entries(appearanceOptions);
  const base = createGateAppearance();
  for (let left = 0; left < entries.length; left++) {
    for (let right = left + 1; right < entries.length; right++) {
      const [leftKey, leftCount] = entries[left];
      const [rightKey, rightCount] = entries[right];
      for (let i = 0; i < leftCount; i++) for (let j = 0; j < rightCount; j++) {
        const appearance = { ...base, [leftKey]: i, [rightKey]: j, width: 384, top: 26 };
        const settings = { ...f.settings, appearance };
        const html = await gatePage(settings, true, 401).text();
        assert.ok(Buffer.byteLength(html) < 5000);
        assert.doesNotMatch(html, /edgechat|cfchat|cloudflare|vite|vue|websocket|manifest|<script|<link|assets|logo|https?:\/\//i);
        assert.match(html, /<form action="\/[A-Za-z0-9_-]+" method="post">/);
        assert.match(html, /name="username" autocomplete="username" maxlength="100" required/);
        assert.match(html, /type="password" name="password" autocomplete="current-password" maxlength="1024" required/);
        assert.equal((html.match(/<input /g) || []).length, 2);
        assert.equal((html.match(/type="submit"/g) || []).length, 1);
        assert.match(html, /role="alert"/);
        assert.equal(await gatePage(settings, true, 401).text(), html);
        assert.doesNotMatch(await gatePage(settings).text(), /role="alert"/);
      }
    }
  }
});

test('生产与 CI 模板强制 Worker-first', () => {
  const config = readFileSync(new URL('../wrangler.example.toml', import.meta.url), 'utf8');
  assert.match(config, /binding = "ASSETS"/);
  assert.match(config, /run_worker_first = true/);
});
