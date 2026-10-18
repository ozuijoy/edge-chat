import { errorResponse, errorCodeForStatus, v1ErrorResponse } from './utils.js';
import { validateSession } from './session.js';
import { cookieRequestAllowed, extractSessionToken } from './session-cookie.ts';
import { resolvePolicy } from './rbac/policies.ts';
import { authorizedDatabase, checkPolicy, policyAssertion, runAuthorizedBatch } from './rbac/authorization.ts';
import { ApiError } from './errors.js';

export async function authMiddleware(c, next) {
  if (new URL(c.req.url).pathname.startsWith('/api/admin/')) c.header('Cache-Control', 'private, no-store');
  if (!cookieRequestAllowed(c.req.raw)) return errorResponse('請求被拒絕', 403);
  const token = extractSessionToken(c.req.raw);
  const path = new URL(c.req.url).pathname;
  const management = path.startsWith('/api/admin/') || path === '/api/me/authorization' || path === '/api/auth/session';
  if (path.startsWith('/api/admin/') && !c.req.raw.headers.get('Authorization') && !c.req.raw.headers.get('Cookie')) return errorResponse('請先登錄', 401);
  let result;
  try { result = await validateSession(c.env, token, { management }); }
  catch (error) {
    if (!management) throw error;
    console.error('management_authorization_unavailable');
    return errorResponse('權限服務暫不可用', 503);
  }
  if (!result.ok) {
    if (new URL(c.req.url).pathname.startsWith('/api/v1/')) {
      return v1ErrorResponse(errorCodeForStatus(result.status), result.message, result.status);
    }
    return errorResponse(result.message, result.status);
  }

  c.set('session', result.session);
  await next();
}

export async function adminMiddleware(c, next) {
  const session = c.get('session');
  c.header('Cache-Control', 'private, no-store');
  const method = c.req.method;
  let payload = {};
  if (!['GET', 'DELETE', 'HEAD'].includes(method)) {
    try { payload = await c.req.raw.clone().json(); } catch { throw new ApiError('請求格式無效', 400); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ApiError('請求格式無效', 400);
  }
  const path = new URL(c.req.url).pathname;
  const policy = resolvePolicy(method, path, payload);
  if (!policy) throw new ApiError('後臺操作未授權', 403);
  checkPolicy(session, policy);
  if (policy.fields && Object.keys(payload).some((key) => !policy.fields.includes(key))) throw new ApiError('請求包含不允許修改的字段', 400);
  if (policy.id === 'users.update' && !policy.permissions.length) throw new ApiError('沒有可修改的字段', 400);
  const target = policy.scope === 'group' ? Number(payload.channelId) : policy.path.exec(path)?.[1] || '';
  if (policy.scope === 'user' && Number(target) === session.userId &&
      (policy.id === 'users.delete' || payload.isDisabled === true)) throw new ApiError('不能刪除或封禁自己的賬號', 403);
  const context = { policy, session, target };
  const assertion = policyAssertion(policy, session, target);
  let allowed;
  try { allowed = await c.env.DB.prepare(`SELECT ${assertion.sql} AS ok`).bind(...assertion.params).first(); }
  catch { throw new ApiError('權限服務暫不可用', 503); }
  if (!allowed?.ok) throw new ApiError(policy.id === 'users.history' ? '用戶不存在' : '沒有此操作權限或目標不在管理範圍', policy.id === 'users.history' ? 404 : 403);
  c.set('authorizationContext', context);
  c.set('authorizationDatabase', c.env.DB);
  c.set('unrestrictedEnvironment', c.env);
  if (['telegram.config', 'telegram.create'].includes(policy.id)) {
    // 外部網絡動作不屬於 D1 事務；先持久接受意圖，審計不記錄憑據，後續網絡結果允許獨立失敗。
    await runAuthorizedBatch(c.env.DB, context, [], undefined, { phase: 'accepted' });
  }
  if (method !== 'GET') c.env = { ...c.env, DB: authorizedDatabase(c.env.DB, context) };
  await next();
}
