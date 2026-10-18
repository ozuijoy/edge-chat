// 每次成功登录插入一条，数据库触发器同步淘汰第四条，保留成本不随登录次数增长。
export async function recordLoginInfo(db, userId: number, request: Request, loginProbeId = '') {
  const ip = (request.headers.get('CF-Connecting-IP') || '').slice(0, 64);
  const userAgent = (request.headers.get('User-Agent') || '').slice(0, 1024);
  try {
    await db.prepare(`INSERT INTO user_login_info (user_id, ip, user_agent, login_probe_id)
      VALUES (?, ?, ?, ?)`).bind(userId, ip, userAgent, loginProbeId).run();
  } catch {
    // 登录信息是辅助管理数据，暂时写入失败不能使已验证的用户无法登录；日志不含 IP 或 UA。
    console.error('user_login_info_write_failed');
  }
}

export async function getAdminUserDetails(db, userId: number, actor) {
  const row = await db.prepare(`SELECT u.id, u.username, u.display_name, u.bio,
      u.is_super_admin, u.created_at
    FROM users u
    WHERE u.id = ? AND u.deleted_at IS NULL
      AND (? = 1 OR (u.management_protected = 0 AND u.is_super_admin = 0))`).bind(userId, actor.isSuperAdmin ? 1 : 0).first();
  if (!row) return null;
  const { results } = await db.prepare(`SELECT id, ip, login_at, user_agent,
      webrtc_ips, webrtc_checked_at FROM user_login_info
    WHERE user_id = ? ORDER BY id DESC LIMIT 3`).bind(userId).all();
  return {
    id: row.id, username: row.username, displayName: row.display_name,
    bio: row.bio, isAdmin: Boolean(row.is_super_admin), createdAt: row.created_at,
    loginHistory: results.map((record) => ({
      id: record.id, ip: record.ip, loginAt: record.login_at, userAgent: record.user_agent,
      webrtcIps: JSON.parse(record.webrtc_ips), webrtcCheckedAt: record.webrtc_checked_at,
    })),
  };
}
