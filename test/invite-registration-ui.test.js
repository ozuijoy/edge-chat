import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { compileScript, parse } from '@vue/compiler-sfc';
import { computed, reactive, ref } from 'vue';
import initSqlJs from 'sql.js';
import worker from '../worker/src/index.js';
import { verifyPassword } from '../worker/src/auth.js';
import { createRegistrationInvite } from '../worker/src/data/registration-invites.js';
import { createD1Adapter, createKvAdapter } from './support/d1.js';

const page = readFileSync(new URL('../frontend/src/pages/RegisterPage.vue', import.meta.url), 'utf8');
const { descriptor } = parse(page);
const { scriptSetupAst } = compileScript(descriptor, { id: 'invite-registration-test' });
// 执行页面原始逻辑而不是复制提交函数，避免测试与真实表单再次出现契约偏差。
const setupSource = scriptSetupAst.filter((node) => node.type !== 'ImportDeclaration')
  .map((node) => descriptor.scriptSetup.content.slice(node.start, node.end)).join('\n');

function registrationPage(registerWithInvite = async () => ({ ok: true })) {
  const calls = [];
  const navigations = [];
  const state = runInNewContext(`${setupSource}\n({ form, loading, error, submit });`, {
    computed, reactive, ref,
    onMounted() {},
    loadAuthFonts() {},
    useCursor() {},
    useRoute: () => ({ params: { token: 'local-invite-test' } }),
    useRouter: () => ({ push: (target) => navigations.push(target) }),
    useI18n: () => ({ t: (key) => key }),
    api: { registerWithInvite: async (token, body) => {
      calls.push({ token, body: JSON.parse(JSON.stringify(body)) });
      return registerWithInvite(token, body);
    } },
  });
  Object.assign(state.form, { username: 'invite_test', displayName: 'Invite Test',
    password: 'test-password', confirmPassword: 'test-password' });
  return { ...state, calls, navigations };
}

test('邀请注册：确认密码不一致时不请求，改正后只提交注册字段', async () => {
  const state = registrationPage();
  state.form.confirmPassword = 'different';
  await state.submit();
  assert.equal(state.error.value, 'auth.passwordMismatch');
  assert.equal(state.loading.value, false);
  assert.equal(state.calls.length, 0);
  assert.equal(state.navigations.length, 0);
  state.form.confirmPassword = state.form.password;
  await state.submit();
  assert.equal(state.error.value, '');
  assert.equal(state.loading.value, false);
  assert.deepEqual(state.calls, [{ token: 'local-invite-test', body: {
    username: 'invite_test', displayName: 'Invite Test', password: 'test-password',
  } }]);
  assert.deepEqual(JSON.parse(JSON.stringify(state.navigations)), [{ name: 'login', query: { registered: '1' } }]);
});

test('邀请注册：请求失败保留表单，允许修改和重试', async () => {
  let fail = true;
  const state = registrationPage(async () => {
    if (fail) throw new Error('network unavailable');
    return { ok: true };
  });
  await state.submit();
  assert.equal(state.error.value, 'network unavailable');
  assert.equal(state.loading.value, false);
  assert.equal(state.form.confirmPassword, 'test-password');
  assert.equal(state.navigations.length, 0);
  assert.match(descriptor.template.content, /<form\s+v-if="invite"/);
  fail = false;
  await state.submit();
  assert.equal(state.error.value, '');
  assert.equal(state.navigations.length, 1);
});

test('邀请注册：实际页面提交通过 Worker 校验，创建普通账号并仅消耗一次邀请', async () => {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  try {
    database.exec(readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'));
    const env = { DB: createD1Adapter(database), SESSIONS: createKvAdapter() };
    await createRegistrationInvite(env.DB, { token: 'local-invite-test', note: '', maxUses: 1, createdBy: null });
    const state = registrationPage(async (token, body) => {
      const response = await worker.fetch(new Request(`https://invite.test/api/register-links/${token}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }), env, { waitUntil() {} });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      return result;
    });
    await state.submit();
    assert.equal(state.error.value, '');
    assert.equal(state.navigations.length, 1);
    const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind('invite_test').first();
    assert.equal(user.display_name, 'Invite Test');
    assert.equal(user.is_super_admin, 0);
    assert.equal(await verifyPassword('test-password', user.password_hash, user.password_salt), true);
    const invite = await env.DB.prepare('SELECT used_count FROM registration_invites WHERE token = ?')
      .bind('local-invite-test').first();
    assert.equal(invite.used_count, 1);
    const role = await env.DB.prepare('SELECT role_id FROM rbac_user_roles WHERE user_id = ?').bind(user.id).first();
    assert.equal(role.role_id, 1);
  } finally {
    database.close();
  }
});
