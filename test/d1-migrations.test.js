import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

import { D1_MIGRATIONS } from "../.github/scripts/d1-migration-manifest.mjs";
import { buildD1MigrationPlan } from "../.github/scripts/d1-migration-plan.mjs";
import { D1_REPAIRS } from "../.github/scripts/d1-repair-manifest.mjs";

const repositoryRoot = new URL("../", import.meta.url);
const SQL = await initSqlJs({
	locateFile(file) {
		return fileURLToPath(new URL(`../node_modules/sql.js/dist/${file}`, import.meta.url));
	},
});
const schemaSql = readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8");

function readMigration(file) {
	return readFileSync(new URL(file, repositoryRoot), "utf8");
}

function artifactsThrough(migrationIndex) {
	return new Set(
		D1_MIGRATIONS.slice(0, migrationIndex + 1).flatMap((migration) => migration.artifacts),
	);
}

function createLegacyReadDatabase() {
	const db = new SQL.Database();
	db.exec(`
		PRAGMA foreign_keys = ON;

		CREATE TABLE users (
			id INTEGER PRIMARY KEY,
			username TEXT NOT NULL UNIQUE
		);
		CREATE TABLE channels (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL UNIQUE
		);
		CREATE TABLE messages (
			id INTEGER PRIMARY KEY,
			channel_id INTEGER NOT NULL REFERENCES channels(id),
			sender_id INTEGER NOT NULL REFERENCES users(id),
			content TEXT NOT NULL DEFAULT '',
			attachment_key TEXT,
			attachment_name TEXT,
			attachment_type TEXT,
			attachment_size INTEGER,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			deleted_at TEXT
		);
		CREATE INDEX idx_messages_channel_created ON messages(channel_id, id DESC);
		CREATE INDEX idx_messages_sender_created ON messages(sender_id, id DESC);

		CREATE TABLE message_reads (
			channel_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			last_read_message_id INTEGER NOT NULL DEFAULT 0,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (channel_id, user_id),
			FOREIGN KEY (channel_id) REFERENCES channels(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		);
		CREATE INDEX idx_message_reads_user ON message_reads(user_id, updated_at DESC);

		CREATE TABLE channel_reads (
			channel_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			last_read_message_id INTEGER NOT NULL DEFAULT 0,
			last_read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (channel_id, user_id),
			FOREIGN KEY (channel_id) REFERENCES channels(id),
			FOREIGN KEY (user_id) REFERENCES users(id),
			FOREIGN KEY (last_read_message_id) REFERENCES messages(id)
		);

		INSERT INTO users (id, username) VALUES (1, 'alice');
		INSERT INTO channels (id, name) VALUES (1, 'general');
		INSERT INTO messages (id, channel_id, sender_id, content) VALUES
			(1, 1, 1, 'one'),
			(2, 1, 1, 'two'),
			(3, 1, 1, 'three');
		INSERT INTO message_reads (channel_id, user_id, last_read_message_id, updated_at)
		VALUES (1, 1, 2, '2026-08-12 09:00:00');
		INSERT INTO channel_reads (channel_id, user_id, last_read_message_id, last_read_at)
		VALUES (1, 1, 3, '2026-08-12 10:00:00');
	`);
	return db;
}

test("迁移清单覆盖全部 D1 SQL 且保持文件顺序", () => {
	const files = readdirSync(new URL("../worker/migrations/", import.meta.url))
		.filter((file) => file.endsWith(".sql"))
		.sort()
		.map((file) => `worker/migrations/${file}`);

	assert.deepEqual(
		D1_MIGRATIONS.map((migration) => migration.file),
		files,
	);
});

test("完整数据库只登记迁移基线，不重复执行历史 SQL", async () => {
	const plan = await buildD1MigrationPlan({
		migrations: D1_MIGRATIONS,
		repairs: D1_REPAIRS,
		appliedMigrations: new Map(),
		artifacts: artifactsThrough(D1_MIGRATIONS.length - 1),
		readSql: readMigration,
	});

	assert.equal(plan.decisions.every((decision) => decision.action === "baseline"), true);
	assert.doesNotMatch(plan.sql, /ALTER TABLE registration_invites/);
	assert.match(plan.sql, /CREATE TABLE IF NOT EXISTS edgechat_schema_migrations/);
});

test("旧数据库只执行缺失的邀请次数迁移", async () => {
	const inviteMigrationIndex = D1_MIGRATIONS.findIndex(
		(migration) => migration.id === "2026-07-29-registration-invite-usage",
	);
	const plan = await buildD1MigrationPlan({
		migrations: D1_MIGRATIONS.slice(0, inviteMigrationIndex + 1),
		appliedMigrations: new Map(),
		artifacts: artifactsThrough(inviteMigrationIndex - 1),
		readSql: readMigration,
	});

	assert.equal(plan.decisions.at(-1).action, "apply");
	assert.match(plan.sql, /ADD COLUMN max_uses/);
	assert.match(plan.sql, /CREATE TABLE IF NOT EXISTS registration_invite_uses/);
	assert.doesNotMatch(plan.sql, /DROP TABLE channels/);
});

test("旧数据库会新增用户临时封禁截止时间字段", async () => {
	const migrationIndex = D1_MIGRATIONS.findIndex(
		(migration) => migration.id === "2026-08-20-user-ban-expiry",
	);
	const plan = await buildD1MigrationPlan({
		migrations: D1_MIGRATIONS,
		appliedMigrations: new Map(),
		artifacts: artifactsThrough(migrationIndex - 1),
		readSql: readMigration,
	});

	assert.equal(plan.decisions.at(-1).action, "apply");
	assert.match(plan.sql, /ALTER TABLE users ADD COLUMN disabled_until TEXT/);
});

test("Telegram 迁移前会修复旧 channel_reads 外键并保留已读进度", async () => {
	const telegramMigration = D1_MIGRATIONS.find(
		(migration) => migration.id === "2026-08-12-telegram-bridge",
	);
	const migrationSql = readMigration(telegramMigration.file);
	const brokenDb = createLegacyReadDatabase();

	assert.throws(
		() => brokenDb.exec(`BEGIN;\n${migrationSql}\nCOMMIT;`),
		/FOREIGN KEY constraint failed/,
	);
	brokenDb.close();

	const plan = await buildD1MigrationPlan({
		migrations: [telegramMigration],
		repairs: D1_REPAIRS,
		appliedMigrations: new Map(),
		artifacts: new Set(["table:channel_reads"]),
		readSql: readMigration,
	});
	const repairIndex = plan.sql.indexOf("DROP TABLE channel_reads");
	const messageRebuildIndex = plan.sql.indexOf("DROP TABLE messages");
	assert.ok(repairIndex > 0);
	assert.ok(messageRebuildIndex > repairIndex);
	assert.deepEqual(plan.decisions.slice(0, 2), [
		{ id: "2026-08-16-legacy-channel-reads", action: "repair" },
		{ id: "2026-08-12-telegram-bridge", action: "apply" },
	]);

	const repairedDb = createLegacyReadDatabase();
	repairedDb.exec(`BEGIN;\n${plan.sql}\nCOMMIT;`);
	const readProgress = repairedDb.exec(
		"SELECT last_read_message_id, updated_at FROM message_reads WHERE channel_id = 1 AND user_id = 1",
	)[0].values[0];
	assert.deepEqual(readProgress, [3, "2026-08-12 10:00:00"]);
	assert.equal(
		repairedDb.exec("SELECT name FROM sqlite_master WHERE name = 'channel_reads'").length,
		0,
	);
	assert.equal(repairedDb.exec("PRAGMA foreign_key_check").length, 0);
	repairedDb.close();
});

test("部分迁移状态会阻断部署，避免继续发布不兼容代码", async () => {
	const inviteMigrationIndex = D1_MIGRATIONS.findIndex(
		(migration) => migration.id === "2026-07-29-registration-invite-usage",
	);
	const artifacts = artifactsThrough(inviteMigrationIndex - 1);
	artifacts.add("column:registration_invites.max_uses");

	await assert.rejects(
		() =>
			buildD1MigrationPlan({
					migrations: D1_MIGRATIONS.slice(0, inviteMigrationIndex + 1),
				appliedMigrations: new Map(),
				artifacts,
				readSql: readMigration,
			}),
		/数据库结构只完成了一部分/,
	);
});

test("Windows CRLF 迁移校验值会在 Linux Actions 中自动归一化", async () => {
	const sql = "CREATE TABLE example (id INTEGER);\n";
	const legacyChecksum = createHash("sha256")
		.update(sql.replaceAll("\n", "\r\n"))
		.digest("hex");
	const plan = await buildD1MigrationPlan({
		migrations: [
			{
				id: "cross-platform",
				file: "cross-platform.sql",
				artifacts: ["table:example"],
			},
		],
		appliedMigrations: new Map([["cross-platform", legacyChecksum]]),
		artifacts: new Set(["table:example"]),
		readSql() {
			return sql;
		},
	});

	assert.deepEqual(plan.decisions, [{ id: "cross-platform", action: "normalize" }]);
	assert.match(plan.sql, /统一 cross-platform 的跨平台换行符校验值/);
	assert.match(plan.sql, /UPDATE edgechat_schema_migrations/);
});

test("R2 引用迁移会替换已发布触发器，升级库与新装库使用相同不变量", async () => {
	const migrationIndex = D1_MIGRATIONS.findIndex(
		(migration) => migration.id === "2026-09-12-r2-reference-invariants",
	);
	const migration = D1_MIGRATIONS[migrationIndex];
	const plan = await buildD1MigrationPlan({
		migrations: [migration],
		appliedMigrations: new Map(),
		artifacts: artifactsThrough(migrationIndex - 1),
		readSql: readMigration,
	});
	assert.deepEqual(plan.decisions, [
		{ id: "2026-09-12-r2-reference-invariants", action: "apply" },
	]);
	assert.match(plan.sql, /DROP TRIGGER IF EXISTS prevent_pending_message_attachment_insert/);

	const upgraded = new SQL.Database();
	upgraded.exec(schemaSql);
	for (const name of [
		"prevent_general_member_removal",
		"prevent_pending_message_attachment_insert",
		"prevent_pending_message_attachment_update",
		"prevent_pending_user_avatar_insert",
		"prevent_pending_user_avatar_update",
		"prevent_pending_channel_avatar_insert",
		"prevent_pending_channel_avatar_update",
		"prevent_pending_site_icon_insert",
		"prevent_pending_site_icon_update",
	]) {
		upgraded.exec(`DROP TRIGGER IF EXISTS ${name}`);
	}
	upgraded.exec(readMigration("worker/migrations/2026-09-11-r2-cleanup-guards.sql"));
	upgraded.exec(`CREATE TRIGGER prevent_general_member_removal
		BEFORE DELETE ON channel_members
		WHEN EXISTS (SELECT 1 FROM channels WHERE id = OLD.channel_id AND name = 'general')
		BEGIN SELECT RAISE(ABORT, 'GENERAL_MEMBERSHIP_REQUIRED'); END`);
	upgraded.exec(
		`INSERT INTO users (id, username, display_name, password_hash, password_salt)
		 VALUES (1, 'legacy', 'Legacy', 'hash', 'salt')`,
	);
	upgraded.exec(
		"INSERT INTO messages (channel_id, sender_id, content, attachment_key) VALUES (1, 1, 'old guard', 'missing-before-upgrade')",
	);
	upgraded.exec(readMigration(migration.file));
	assert.throws(
		() => upgraded.exec(
			"INSERT INTO messages (channel_id, sender_id, content, attachment_key) VALUES (1, 1, 'new guard', 'missing-after-upgrade')",
		),
		/r2_local_object_unavailable/,
	);
	const triggerSql = upgraded.exec(
		"SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'prevent_pending_message_attachment_insert'",
	)[0].values[0][0];
	assert.match(triggerSql, /FROM uploaded_files/);
	assert.equal(
		upgraded.exec(
			"SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name IN ('prevent_pending_site_icon_insert', 'prevent_pending_site_icon_update')",
		)[0].values[0][0],
		2,
	);

	const fresh = new SQL.Database();
	fresh.exec(schemaSql);
	const normalizedTriggerSql = (db, name) =>
		String(
			db.exec("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?", [name])[0]
				.values[0][0],
		)
			.replace(/CREATE TRIGGER IF NOT EXISTS/i, "CREATE TRIGGER")
			.replace(/\s+/g, " ")
			.trim();
	for (const name of [
		"prevent_general_member_removal",
		"prevent_pending_message_attachment_insert",
		"prevent_pending_message_attachment_update",
		"prevent_pending_user_avatar_insert",
		"prevent_pending_user_avatar_update",
		"prevent_pending_channel_avatar_insert",
		"prevent_pending_channel_avatar_update",
		"prevent_pending_site_icon_insert",
		"prevent_pending_site_icon_update",
	]) {
		assert.equal(normalizedTriggerSql(upgraded, name), normalizedTriggerSql(fresh, name));
	}
	upgraded.close();
	fresh.close();
});

test("部署工作流每次发布都在 Worker 之前准备并执行 D1 迁移", () => {
	const workflow = readFileSync(
		new URL("../.github/workflows/deploy-worker.yml", import.meta.url),
		"utf8",
	).replaceAll("\r\n", "\n");
	const prepareIndex = workflow.indexOf("      - name: Prepare D1 migrations\n");
	const applyIndex = workflow.indexOf("      - name: Apply D1 migrations\n");
	const deployIndex = workflow.indexOf("      - name: Deploy worker\n");

	assert.ok(prepareIndex > 0);
	assert.ok(applyIndex > prepareIndex);
	assert.ok(deployIndex > applyIndex);
	assert.doesNotMatch(
		workflow.slice(prepareIndex, workflow.indexOf("      - name: ", prepareIndex + 20)),
		/d1_created == 'true'/,
	);
	assert.match(workflow, /prepare-d1-migrations\.mjs/);
	assert.match(workflow, /\.tmp\/edgechat-d1-migrations\.sql/);
});

test("CI Wrangler 配置保留收件箱 Durable Object 与管理员变量", () => {
	const config = readFileSync(new URL("../wrangler.example.toml", import.meta.url), "utf8");

	assert.match(config, /ADMIN_USERNAMES = "admin"/);
	assert.match(config, /name = "USER_INBOX"\s+class_name = "UserInbox"/);
	assert.match(config, /tag = "v2"\s+new_sqlite_classes = \["UserInbox"\]/);
});
