export const SITE_COLOR_THEMES = ['default', 'cream-sakura'] as const;
export type SiteColorTheme = typeof SITE_COLOR_THEMES[number];

export function isSiteColorTheme(value: unknown): value is SiteColorTheme {
  return value === 'default' || value === 'cream-sakura';
}

// 舊站點尚無該設置時沿用原配色，不需要遷移或批量改寫數據庫。
export function normalizeSiteColorTheme(value: unknown): SiteColorTheme {
  return isSiteColorTheme(value) ? value : 'default';
}
