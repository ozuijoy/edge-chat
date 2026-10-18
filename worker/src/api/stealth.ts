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
    if (typeof payload.enabled !== 'boolean') return errorResponse('設置無效');
    const settings = await saveStealthSettings(c.env.DB, payload.enabled);
    // 打開後立即刷新仍能進入後臺，避免只有舊 localStorage token 的管理員被鎖在網關外。
    c.header('Set-Cookie', sessionCookie(c.req.raw, c.get('session').token));
    return c.json({ enabled: settings.enabled });
  });
}
