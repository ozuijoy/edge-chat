export const SITE_COLOR_THEMES = ['default', 'cream-sakura'] as const;
export type SiteColorTheme = typeof SITE_COLOR_THEMES[number];

export function isSiteColorTheme(value: unknown): value is SiteColorTheme {
  return value === 'default' || value === 'cream-sakura';
}

// 旧站点尚无该设置时沿用原配色，不需要迁移或批量改写数据库。
export function normalizeSiteColorTheme(value: unknown): SiteColorTheme {
  return isSiteColorTheme(value) ? value : 'default';
}
