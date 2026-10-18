import { normalizeSiteColorTheme } from '../../shared/site-theme.ts';

export function applySiteColorTheme(value: unknown, root = document.documentElement) {
  root.dataset.colorTheme = normalizeSiteColorTheme(value);
}
