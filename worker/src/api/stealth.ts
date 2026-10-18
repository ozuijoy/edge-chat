import { getStealthSettings, saveStealthSettings } from '../data/stealth-settings.ts';
import { sessionCookie } from '../session-cookie.ts';
import { errorResponse, parseJsonRequest } from '../utils.js';

export function registerStealthRoutes(app) {
  app.get('/api/admin/stealth', async (c) => {
    const settings = await getStealthSettings(c.env.DB);
    return c.json({ enabled: settings?.enabled ?? false });
  });
  app.put('/api/admin/stealth', async (c) => {
    const payload = await parseJsonRequest(c.req.raw);
    if (typeof payload.enabled !== 'boolean') return errorResponse('设置无效');
    const settings = await saveStealthSettings(c.env.DB, payload.enabled);
    // 打开后立即刷新仍能进入后台，避免只有旧 localStorage token 的管理员被锁在网关外。
    c.header('Set-Cookie', sessionCookie(c.req.raw, c.get('session').token));
    return c.json({ enabled: settings.enabled });
  });
}
