import type { Hono } from 'hono';
import { runSystemCheck } from '../maintenance/system-check.ts';

export function registerMaintenanceRoutes(app: Hono) {
  app.get('/api/admin/maintenance', async (c) => {
    c.header('Cache-Control', 'private, no-store');
    const report = await runSystemCheck(c.env);
    if (c.get('session').isSuperAdmin) return c.json(report);
    return c.json({ version: report.version, status: report.status, checkedAt: report.checkedAt, durationMs: report.durationMs,
      checks: report.checks.map(({ id, status }) => ({ id, status })) });
  });
}
