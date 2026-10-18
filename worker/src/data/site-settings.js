import { normalizeSiteIconForStorage, siteIconUrlFromStored } from "../site-icon.js";
import { normalizeSiteColorTheme } from "../../../shared/site-theme.ts";

export async function getSiteSettings(db) {
	const { results } = await db
		.prepare("SELECT setting_key, setting_value FROM site_settings")
		.all();
	const map = Object.fromEntries(
		results.map((row) => [row.setting_key, row.setting_value]),
	);
	return {
		siteName: String(map.site_name || "Edgechat"),
		siteIconUrl: siteIconUrlFromStored(map.site_icon_url),
			colorTheme: normalizeSiteColorTheme(map.site_color_theme),
	};
}

export async function updateSiteSettings(db, { siteName, siteIconUrl, colorTheme, siteOrigin = "" }) {
	const statements = [];
	if (siteName !== undefined) {
		statements.push(
			db
				.prepare(
					`INSERT INTO site_settings (setting_key, setting_value, updated_at)
					 VALUES ('site_name', ?, CURRENT_TIMESTAMP)
					 ON CONFLICT(setting_key) DO UPDATE
					 SET setting_value = excluded.setting_value,
					     updated_at = CURRENT_TIMESTAMP`,
				)
				.bind(String(siteName || "Edgechat").trim() || "Edgechat"),
		);
	}
	if (siteIconUrl !== undefined) {
		const storedIcon = normalizeSiteIconForStorage(siteIconUrl, [siteOrigin]);
		statements.push(
			db
				.prepare(
					`INSERT INTO site_settings (setting_key, setting_value, updated_at)
					 VALUES ('site_icon_url', ?, CURRENT_TIMESTAMP)
					 ON CONFLICT(setting_key) DO UPDATE
					 SET setting_value = excluded.setting_value,
					     updated_at = CURRENT_TIMESTAMP`,
				)
				.bind(storedIcon),
		);
	}
	if (colorTheme !== undefined) {
		statements.push(
			db.prepare(
				`INSERT INTO site_settings (setting_key, setting_value, updated_at)
				 VALUES ('site_color_theme', ?, CURRENT_TIMESTAMP)
				 ON CONFLICT(setting_key) DO UPDATE
				 SET setting_value = excluded.setting_value,
				     updated_at = CURRENT_TIMESTAMP`,
			).bind(colorTheme),
		);
	}
	if (statements.length) {
		await db.batch(statements);
	}
	return getSiteSettings(db);
}
