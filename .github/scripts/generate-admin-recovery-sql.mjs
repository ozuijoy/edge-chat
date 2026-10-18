#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashPassword } from '../../worker/src/auth.js';

export async function generateRecoverySql(userId, password) {
  if (!Number.isSafeInteger(userId) || userId < 1 || !password) throw new Error('Provide an existing user ID and a new password');
  const hashed = await hashPassword(password);
  const requestId = crypto.randomUUID();
  // 恢复由部署者显式执行，先确认目标存在，再恢复身份与分组，并使所有旧会话失效。
  return `INSERT INTO admin_write_guard (request_id, ok) VALUES ('${requestId}', CASE WHEN EXISTS (SELECT 1 FROM users WHERE id = ${userId}) THEN 1 ELSE 0 END);
INSERT INTO rbac_user_roles (user_id, role_id) VALUES (${userId}, 1) ON CONFLICT(user_id) DO UPDATE SET role_id = 1;
UPDATE users SET is_super_admin = 1, is_admin = 1, management_protected = 1,
  is_disabled = 0, disabled_until = NULL, deleted_at = NULL,
  password_hash = '${hashed.hash}', password_salt = '${hashed.salt}',
  authz_version = authz_version + 1, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ${userId};
INSERT INTO admin_audit_log (request_id, actor_name, action, target, summary) VALUES ('${requestId}', 'deployment operator', 'superadmin.recovery', '${userId}', '{}');
DELETE FROM admin_write_guard WHERE request_id = '${requestId}';
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv.includes('--confirm-super-admin-recovery')) throw new Error('Explicit --confirm-super-admin-recovery is required');
  const sql = await generateRecoverySql(Number(process.env.EDGECHAT_RECOVER_USER_ID), process.env.EDGECHAT_RECOVER_PASSWORD);
  mkdirSync('.tmp', { recursive: true });
  const output = resolve('.tmp/edgechat-admin-recovery.sql');
  writeFileSync(output, sql, 'utf8');
  console.log(`Generated recovery SQL: ${output}. Review and apply explicitly; this command does not deploy.`);
}
