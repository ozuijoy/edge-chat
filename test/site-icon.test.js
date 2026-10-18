import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Hono } from "hono";
import initSqlJs from "sql.js";

import { registerAdminRoutes } from "../worker/src/api/admin.js";
import { getSiteSettings, updateSiteSettings } from "../worker/src/data/site-settings.js";
import { canAccessFile } from "../worker/src/data/uploaded-files.js";
import { saveUploadedFile } from "../worker/src/api/upload.js";
import worker from "../worker/src/index.js";
import { saveStealthSettings } from "../worker/src/data/stealth-settings.ts";
import { runScheduledGc } from "../worker/src/gc.js";
import {
	classifyStoredSiteIcon,
	normalizeSiteIconForStorage,
} from "../worker/src/site-icon.js";
import { createD1Adapter } from "./support/d1.js";

const SQL = await initSqlJs();
const schemaSql = readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8");

function createHarness(key = "1/icon.png") {
	const database = new SQL.Database();
	database.exec(schemaSql);
	database.run(
		`INSERT INTO users (id, username, display_name, password_hash, password_salt)
		 VALUES (1, 'admin', 'Admin', 'hash', 'salt')`,
	);
	database.run(
		"INSERT INTO uploaded_files (object_key, owner_user_id, content_type, created_at) VALUES (?, 1, 'image/png', datetime('now', '-2 day'))",
		[key],
	);
	return { database, db: createD1Adapter(database), key };
}

test("站點圖標統一本地 key，保留真正外鏈並區分未知 origin", () => {
	assert.equal(normalizeSiteIconForStorage("/files/1%2Ficon.png"), "r2:1/icon.png");
	assert.equal(
		normalizeSiteIconForStorage(
			"https://chat.example/files/1%2Ficon.png",
			["https://chat.example"],
		),
		"r2:1/icon.png",
	);
	assert.equal(
		normalizeSiteIconForStorage(
			"https://cdn.example/files/1%2Ficon.png",
			["https://chat.example"],
		),
		"https://cdn.example/files/1%2Ficon.png",
	);
	assert.deepEqual(
		classifyStoredSiteIcon(
			"https://cdn.example/files/1%2Ficon.png",
			["https://chat.example"],
		),
		{ kind: "external", key: null },
	);
	assert.deepEqual(
		classifyStoredSiteIcon("https://cdn.example/files/1%2Ficon.png"),
		{ kind: "ambiguous", key: "1/icon.png" },
	);
	assert.deepEqual(classifyStoredSiteIcon("https://cdn.example/icon.png"), {
		kind: "external",
		key: null,
	});
});

for (const [label, storedValue] of [
	["歷史相對路徑", "/files/1%2Ficon.png"],
	["歷史完整 URL", "https://chat.example/files/1%2Ficon.png"],
	["歷史裸 key", "1/icon.png"],
]) {
	test(`${label}站點圖標不會被孤兒 GC 誤刪`, async () => {
		const { database, db } = createHarness();
		database.run(
			"UPDATE site_settings SET setting_value = ? WHERE setting_key = 'site_icon_url'",
			[storedValue],
		);
		const deleted = [];
		await runScheduledGc({
			DB: db,
			FILES: { async delete(key) { deleted.push(key); } },
		});
		assert.deepEqual(deleted, []);
		assert.equal(
			database.exec("SELECT COUNT(*) FROM uploaded_files")[0].values[0][0],
			1,
		);
	});
}

test("本站完整 URL 保存為原子保護的本地 key，外鏈不阻止無關孤兒清理", async () => {
	const local = createHarness();
	const saved = await updateSiteSettings(local.db, {
		siteName: "Edgechat",
		siteIconUrl: "https://chat.example/files/1%2Ficon.png",
		siteOrigin: "https://chat.example",
	});
	assert.equal(saved.siteIconUrl, "/files/1%2Ficon.png");
	assert.equal(
		local.database.exec(
			"SELECT setting_value FROM site_settings WHERE setting_key = 'site_icon_url'",
		)[0].values[0][0],
		"r2:1/icon.png",
	);
	const localDeletes = [];
	await runScheduledGc({
		DB: local.db,
		FILES: { async delete(key) { localDeletes.push(key); } },
	});
	assert.deepEqual(localDeletes, []);

	const external = createHarness("1/orphan.png");
	await updateSiteSettings(external.db, {
		siteName: "Edgechat",
		siteIconUrl: "https://cdn.example/icon.png",
		siteOrigin: "https://chat.example",
	});
	assert.deepEqual(await getSiteSettings(external.db), {
		siteName: "Edgechat",
		siteIconUrl: "https://cdn.example/icon.png",
			colorTheme: "default",
	});
	const externalDeletes = [];
	await runScheduledGc({
		DB: external.db,
		FILES: { async delete(key) { externalDeletes.push(key); } },
	});
	assert.deepEqual(externalDeletes, ["1/orphan.png"]);
});

test("可信 origin 已配置時，外域 /files/ URL 不會保護同名本地孤兒", async () => {
	const external = createHarness();
	external.database.run(
		"UPDATE site_settings SET setting_value = 'https://cdn.example/files/1%2Ficon.png' WHERE setting_key = 'site_icon_url'",
	);
	const deleted = [];
	await runScheduledGc({
		DB: external.db,
		FILES: { async delete(key) { deleted.push(key); } },
		SITE_ORIGINS: "https://chat.example",
	});
	assert.deepEqual(deleted, ["1/icon.png"]);
});

test("站點圖標寫入在 pending 階段和刪除完成後都拒絕失效 key", async () => {
	const { database, db } = createHarness();
	database.run("INSERT INTO pending_r2_delete (object_key) VALUES ('1/icon.png')");
	await assert.rejects(
		updateSiteSettings(db, { siteIconUrl: "/files/1%2Ficon.png" }),
		/r2_local_object_unavailable/,
	);
	database.run("DELETE FROM uploaded_files WHERE object_key = '1/icon.png'");
	database.run("DELETE FROM pending_r2_delete WHERE object_key = '1/icon.png'");
	await assert.rejects(
		updateSiteSettings(db, { siteIconUrl: "/files/1%2Ficon.png" }),
		/r2_local_object_unavailable/,
	);
});

test("管理 API 將站點圖標競態映射為明確業務錯誤", async () => {
	const { database, db } = createHarness();
	database.run("INSERT INTO pending_r2_delete (object_key) VALUES ('1/icon.png')");
	const app = new Hono();
	registerAdminRoutes(app);
	const response = await app.fetch(
		new Request("https://chat.example/api/admin/site-settings", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				siteName: "Edgechat",
				siteIconUrl: "https://chat.example/files/1%2Ficon.png",
			}),
		}),
		{ DB: db },
	);
	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), {
		error: "站點圖標文件不存在或正在清理，請重新上傳",
	});
});

test("上傳圖標保存後可匿名讀取與解密，替換、清除及隱身模式收回訪問", async () => {
	const { database, db } = createHarness();
	const objects = new Map();
	const env = {
		DB: db,
		EDGECHAT_ENCRYPTION_KEYRING: JSON.stringify({ activeKeyId: 'test', keys: { test: Buffer.alloc(32, 1).toString('base64') } }),
		FILES: {
			async put(key, bytes, metadata) { objects.set(key, { bytes, metadata }); },
			async get(key) {
				const object = objects.get(key);
				return object ? {
					async arrayBuffer() { return object.bytes; },
					writeHttpMetadata(headers) { headers.set('content-type', object.metadata.httpMetadata.contentType); },
				} : null;
			},
		},
	};
	const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
	const { file } = await saveUploadedFile(env, { userId: 1 }, new File([bytes], 'icon.png', { type: 'image/png' }));
	const request = () => worker.fetch(new Request(`https://chat.example${file.url}`), env, {});
	assert.equal((await request()).status, 403);
	assert.equal(await canAccessFile(db, file.key, 1), true);
	await updateSiteSettings(db, { siteIconUrl: file.url });
	const response = await request();
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('content-type'), 'image/png');
	assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
	await updateSiteSettings(db, { siteIconUrl: '/files/1%2Ficon.png' });
	assert.equal((await request()).status, 403);
	await updateSiteSettings(db, { siteIconUrl: file.url });
	await updateSiteSettings(db, { siteIconUrl: '' });
	assert.equal((await request()).status, 403);
	await updateSiteSettings(db, { siteIconUrl: file.url });
	await saveStealthSettings(db, true);
	assert.equal((await request()).status, 404);
	database.close();
});

test("歷史本站圖標引用可讀取，外域同名文件與待刪除對象仍禁止訪問", async () => {
	const { database, db, key } = createHarness();
	const origins = ['https://chat.example'];
	for (const stored of [`r2:${key}`, key, '/files/1%2Ficon.png', `https://chat.example/files/1%2Ficon.png`]) {
		database.run("UPDATE site_settings SET setting_value = ? WHERE setting_key = 'site_icon_url'", [stored]);
		assert.equal(await canAccessFile(db, key, null, origins), true, stored);
	}
	database.run("UPDATE site_settings SET setting_value = 'https://cdn.example/files/1%2Ficon.png' WHERE setting_key = 'site_icon_url'");
	assert.equal(await canAccessFile(db, key, null, origins), false);
	await updateSiteSettings(db, { siteIconUrl: '/files/1%2Ficon.png' });
	database.run("INSERT INTO pending_r2_delete (object_key) VALUES ('1/icon.png')");
	assert.equal(await canAccessFile(db, key, null, origins), false);
	assert.equal(await canAccessFile(db, key, 1, origins), false);
	database.close();
});

test("站點圖標引用不會公開非圖片附件或可執行 SVG", async () => {
	const { database, db, key } = createHarness();
	await updateSiteSettings(db, { siteIconUrl: '/files/1%2Ficon.png' });
	for (const contentType of ['application/pdf', 'text/html', 'image/svg+xml', '']) {
		database.run('UPDATE uploaded_files SET content_type = ? WHERE object_key = ?', [contentType, key]);
		assert.equal(await canAccessFile(db, key, null), false, contentType);
		assert.equal(await canAccessFile(db, key, 1), true, contentType);
	}
	database.close();
});
