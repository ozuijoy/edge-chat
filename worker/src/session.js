import { deleteSession, getSession, isAdminUser, putSession } from './auth.js';
import { isUserDisabled } from './user-status.js';
import { AUTHORIZATION_COLUMNS, AUTHORIZATION_JOIN, authorizationFromRow } from './rbac/authorization.ts';

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export async function validateSession(env, token, { management = false } = {}) {
  const session = await getSession(env, token);
  if (!session) {
    return { ok: false, status: 401, message: '請先登錄' };
  }

  const { results } = await env.DB.prepare(
    `SELECT u.username, u.is_disabled, u.disabled_until, u.deleted_at, u.session_version, u.is_super_admin
       ${management ? `, ${AUTHORIZATION_COLUMNS}` : ''}
     FROM users u ${management ? AUTHORIZATION_JOIN : ''}
     WHERE u.id = ?
     LIMIT 1`
  )
    .bind(session.userId)
    .all();

  const user = results[0];
  if (!user || user.deleted_at || isUserDisabled(user)) {
    await deleteSession(env, token);
    return { ok: false, status: 401, message: '賬號已不可用' };
  }

  if (session.deviceSessionId) {
    const device = await env.DB.prepare(
      `SELECT session_version
       FROM device_sessions
       WHERE id = ?
         AND user_id = ?
         AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`
    )
      .bind(String(session.deviceSessionId), session.userId)
      .all();
    const deviceSession = device.results[0];
    if (!deviceSession || toNumber(deviceSession.session_version) !== toNumber(user.session_version)) {
      await deleteSession(env, token);
      return { ok: false, status: 401, message: '設備登錄已失效，請重新登錄' };
    }
  }

  const dbVersion = toNumber(user.session_version);
  const sessionVersion = toNumber(session.sessionVersion);
  if (sessionVersion !== dbVersion) {
    await deleteSession(env, token);
    return { ok: false, status: 401, message: '登錄已過期，請重新登錄' };
  }

  const refreshed = {
    ...session,
    isAdmin: isAdminUser(env, user),
    isSuperAdmin: Boolean(user.is_super_admin),
    ...(management ? authorizationFromRow(user) : {}),
    sessionVersion: dbVersion
  };

  if (refreshed.isAdmin !== session.isAdmin || refreshed.sessionVersion !== session.sessionVersion) {
    await putSession(env, refreshed);
  }

  return { ok: true, session: refreshed };
}

