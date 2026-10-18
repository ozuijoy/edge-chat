import { isIP } from 'node:net';
import { errorResponse, parseJsonRequest } from '../utils.js';

const statuses = new Set(['completed', 'timeout', 'unsupported', 'failed']);

export function registerLoginNetworkRoutes(app) {
  app.post('/api/auth/login-network', async (c) => {
    const session = c.get('session');
    const body = await parseJsonRequest(c.req.raw);
    if (!session.loginProbeId || body.probeId !== session.loginProbeId) {
      return errorResponse('請求被拒絕', 403);
    }
    if (!statuses.has(body.status) || !Array.isArray(body.ips) || body.ips.length > 4
      || body.ips.some((ip) => typeof ip !== 'string' || ip.length > 45 || !isIP(ip))
      || (['unsupported', 'failed'].includes(body.status) && body.ips.length)) {
      return errorResponse('請求參數錯誤', 400);
    }
    // 結果補到對應登錄，不另佔一條歷史；一次消費且限時，遲到結果不會覆蓋別次登錄。
    await c.env.DB.prepare(`UPDATE user_login_info
      SET webrtc_ips = ?, webrtc_status = ?, webrtc_checked_at = CURRENT_TIMESTAMP, login_probe_id = ''
      WHERE user_id = ? AND login_probe_id = ? AND login_at >= datetime('now', '-2 minutes')`)
      .bind(JSON.stringify([...new Set(body.ips)]), body.status, session.userId, session.loginProbeId).run();
    c.header('Cache-Control', 'private, no-store');
    return c.json({ ok: true });
  });
}
