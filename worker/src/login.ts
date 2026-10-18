import { createSession, verifyPassword } from './auth.js';
import { getUserByUsername } from './data/users.js';
import { recordLoginInfo } from './data/user-login-info.ts';
import { isUserDisabled } from './user-status.js';

export async function loginWithPassword(env, username: string, password: string, request: Request) {
  const user = await getUserByUsername(env.DB, username);
  if (!user || isUserDisabled(user)) return null;
  if (!await verifyPassword(password, user.password_hash, user.password_salt)) return null;
  const loginProbeId = crypto.randomUUID();
  const session = await createSession(env, user, { loginProbeId });
  await recordLoginInfo(env.DB, user.id, request, loginProbeId);
  return session;
}
