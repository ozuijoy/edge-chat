import { randomToken } from '../utils.js';
import { createGateAppearance, isGateAppearance, type GateAppearance } from '../stealth/appearance.ts';

export interface StealthSettings {
  enabled: boolean;
  loginPath: string;
  apiPrefix: string;
  formId: string;
  variant: number;
  appearance?: GateAppearance;
}

export async function getStealthSettings(db): Promise<StealthSettings | null> {
  const { results } = await db.prepare(
    "SELECT setting_value FROM site_settings WHERE setting_key = 'stealth_mode'",
  ).all();
  if (!results[0]) return null;
  const stored = results[0].setting_value;
  const settings: StealthSettings = JSON.parse(stored);
  if (!isGateAppearance(settings.appearance)) {
    // Upgrade old instances once. Compare-and-swap prevents concurrent first reads from rotating the page.
    settings.appearance = createGateAppearance();
    await db.prepare(
      `UPDATE site_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
       WHERE setting_key = 'stealth_mode' AND setting_value = ?`,
    ).bind(JSON.stringify(settings), stored).run();
    // Another request may have won; always serve the profile actually stored in D1.
    return getStealthSettings(db);
  }
  return settings;
}

export async function saveStealthSettings(db, enabled: boolean) {
  const existing = await getStealthSettings(db);
  const settings: StealthSettings = {
    enabled,
    loginPath: existing?.loginPath || `/${randomToken(18)}`,
    apiPrefix: existing?.apiPrefix || `/${randomToken(18)}`,
    formId: existing?.formId || `f${randomToken(9)}`,
    variant: existing?.variant ?? crypto.getRandomValues(new Uint8Array(1))[0] % 3,
    appearance: existing?.appearance ?? createGateAppearance(),
  };
  // 存在既有设置表中，随机标识只在首次配置时生成，重新部署不会使正在使用的入口失效。
  await db.prepare(
    `INSERT INTO site_settings (setting_key, setting_value, updated_at)
     VALUES ('stealth_mode', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(setting_key) DO UPDATE
     SET setting_value = json_set(site_settings.setting_value, '$.enabled', json(?)),
         updated_at = CURRENT_TIMESTAMP`,
  ).bind(JSON.stringify(settings), JSON.stringify(enabled)).run();
  const saved = await getStealthSettings(db);
  if (!saved) throw new Error('Missing saved stealth settings');
  return saved;
}
