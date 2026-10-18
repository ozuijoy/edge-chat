import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import initSqlJs from "sql.js";
import { createSession, hashPassword } from "../worker/src/auth.js";
import worker from "../worker/src/index.js";
import { D1_MIGRATIONS } from "../.github/scripts/d1-migration-manifest.mjs";
import { buildD1MigrationPlan } from "../.github/scripts/d1-migration-plan.mjs";
import { bioLength, validateBio } from "../shared/user-profile.ts";
import { createD1Adapter, createKvAdapter } from "./support/d1.js";

const SQL = await initSqlJs();
const schema = readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8");
const password = await hashPassword("password");

async function harness() {
	const database = new SQL.Database();
	database.exec(schema);
	for (const name of ["alice", "bob", "disabled", "deleted", "expired", "temporary"]) {
		database.run(
			"INSERT INTO users (username, display_name, password_hash, password_salt) VALUES (?, ?, ?, ?)",
			[name, name, password.hash, password.salt],
		);
	}
	database.run("UPDATE users SET is_disabled = 1 WHERE id = 3");
	database.run("UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = 4");
	database.run("UPDATE users SET disabled_until = datetime('now', '-1 hour') WHERE id = 5");
	database.run("UPDATE users SET disabled_until = datetime('now', '+1 hour') WHERE id = 6");
	const env = { DB: createD1Adapter(database), SESSIONS: createKvAdapter() };
	const session = await createSession(env, {
		id: 1, username: "alice", display_name: "alice", session_version: 0,
	});
	async function request(path, { body, token = session.token, method = body === undefined ? "GET" : "PATCH" } = {}) {
		const response = await worker.fetch(new Request(`https://edgechat.test/api${path}`, {
			method,
			headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		}), env, {});
		return { status: response.status, payload: await response.json() };
	}
	return { database, env, request };
}

test("简介纯文本规范化、Unicode code point 与 200/201 边界", () => {
	for (const character of ["a", "中", "😀", "𠮷"]) {
		assert.equal(validateBio(character.repeat(200)), character.repeat(200));
		assert.equal(bioLength(character.repeat(200)), 200);
		assert.throws(() => validateBio(character.repeat(201)), /200/);
	}
	assert.equal(validateBio(" \r\n 中文\r😀\r\n "), "中文\n😀");
	assert.equal(validateBio(" \r\n\t "), "");
	assert.equal(validateBio("<script>alert(1)</script>"), "<script>alert(1)</script>");
	for (const value of [null, 1, false, {}, []]) assert.throws(() => validateBio(value), /文本/);
});

test("Web/v1 简介保存、清空、默认值、PATCH 隔离与 D1 重读", async () => {
	const { request, database } = await harness();
	for (const prefix of ["", "/v1"]) {
		assert.equal((await request(`${prefix}/users/2/profile`)).payload.profile.bio, "");
		assert.equal((await request(`${prefix}/me/profile`, { body: { bio: 'must not update', userId: 2 } })).status, 400);
    let result = await request(`${prefix}/me/profile`, { body: { bio: "  中文\r\n😀  " } });
		assert.equal(result.status, 200);
		assert.equal(result.payload.session.bio, "中文\n😀");
		assert.equal(result.payload.session.displayName, "alice");
		assert.equal(result.payload.session.avatarUrl, "");
		result = await request(`${prefix}/me/profile`, { body: { displayName: "Alice Updated" } });
		assert.equal(result.payload.session.bio, "中文\n😀");
		result = await request(`${prefix}/me/profile`, { body: { avatarKey: null } });
		assert.equal(result.payload.session.bio, "中文\n😀");
		assert.equal(result.payload.session.displayName, "Alice Updated");
		assert.equal((await request(`${prefix}/users/1/profile`)).payload.profile.bio, "中文\n😀");
		assert.equal((await request(`${prefix}/users/2/profile`)).payload.profile.bio, "");
		// KV 快照仍是旧值；会话恢复与 PATCH 必须以 D1 为准。
		database.run("UPDATE users SET bio = 'from database', display_name = 'alice' WHERE id = 1");
		assert.equal((await request(`${prefix}/auth/session`)).payload.session.bio, "from database");
		result = await request(`${prefix}/me/profile`, { body: {} });
		assert.equal(result.payload.session.bio, "from database");
		result = await request(`${prefix}/me/profile`, { body: { bio: "" } });
		assert.equal(result.payload.session.bio, "");
		assert.equal((await request(`${prefix}/users/1/profile`)).payload.profile.bio, "");
	}
});

test("简介保存后网页重新登录从 D1 读取；头像上传引用更新不覆盖简介", async () => {
	const { request, database } = await harness();
	await request("/me/profile", { body: { bio: "saved bio" } });
	database.run("INSERT INTO uploaded_files (object_key, owner_user_id, filename, content_type, size) VALUES ('1/avatar.png', 1, 'avatar.png', 'image/png', 1)");
	const updated = await request("/me/profile", { body: { avatarKey: "1/avatar.png" } });
	assert.equal(updated.status, 200);
	assert.equal(updated.payload.session.bio, "saved bio");
	assert.equal(updated.payload.session.avatarUrl, "/files/1%2Favatar.png");
	const loggedIn = await request("/auth/login", { method: "POST", token: "", body: { username: "alice", password: "password" } });
	assert.equal(loggedIn.status, 200);
	assert.equal(loggedIn.payload.session.bio, "saved bio");
});

test("Web/v1 验证、认证、统一不可用与公开字段白名单", async () => {
	const { request } = await harness();
	for (const prefix of ["", "/v1"]) {
		assert.equal((await request(`${prefix}/users/1/profile`, { token: "" })).status, 401);
		for (const id of ["0", "-1", "1.5", "1e0", "01", "NaN", "9007199254740992", "1%20OR%201=1"]) {
			assert.equal((await request(`${prefix}/users/${id}/profile`)).status, 400, id);
		}
		for (const id of [3, 4, 6, 999]) {
			const result = await request(`${prefix}/users/${id}/profile`);
			assert.equal(result.status, 404);
			assert.equal(prefix ? result.payload.error.message : result.payload.error, "用户资料不可用");
		}
		assert.equal((await request(`${prefix}/users/5/profile`)).status, 200);
		assert.deepEqual(Object.keys((await request(`${prefix}/users/1/profile`)).payload.profile).sort(),
			["avatarUrl", "bio", "displayName", "id", "username"]);
		for (const bio of [null, 200, false, [], {}, "😀".repeat(201)]) {
			const result = await request(`${prefix}/me/profile`, { body: { bio, displayName: "must not update" } });
			assert.equal(result.status, 400);
		}
		for (const body of [null, [], true]) {
			assert.equal((await request(`${prefix}/me/profile`, { body })).status, 400);
		}
		assert.equal((await request(`${prefix}/users/1/profile`)).payload.profile.displayName, "alice");
	}
});

test("查看资料不创建私信、不向用户摘要与 bootstrap 投影简介", async () => {
	const { request, database } = await harness();
	await request("/me/profile", { body: { bio: "private to signed-in viewers" } });
	await request("/users/2/profile");
	assert.equal(database.exec("SELECT COUNT(*) FROM channels WHERE kind = 'dm'")[0].values[0][0], 0);
	const { payload } = await request("/bootstrap");
	assert.equal(payload.users.some((user) => "bio" in user), false);
});

test("资料写入内部异常在 Web/v1 均隐藏堆栈和 SQL 细节", async () => {
	const { request, env } = await harness();
	const prepare = env.DB.prepare;
	env.DB.prepare = (sql) => {
		const statement = prepare(sql);
		if (sql.startsWith("UPDATE users SET")) {
			statement.bind = () => statement;
			statement.run = async () => { throw new Error("internal_sql_detail_do_not_expose"); };
		}
		return statement;
	};
	const logError = console.error;
	console.error = () => {};
	try {
		for (const prefix of ["", "/v1"]) {
			const result = await request(`${prefix}/me/profile`, { body: { bio: "test" } });
			assert.equal(result.status, 500);
			assert.equal(prefix ? result.payload.error.message : result.payload.error, "服务器开小差了");
			assert.doesNotMatch(JSON.stringify(result.payload), /internal_sql_detail|stack/);
		}
	} finally {
		console.error = logError;
	}
});

test("用户简介新安装、旧库升级与重复迁移规划保持数据", async () => {
	const migration = D1_MIGRATIONS.find((item) => item.id === "2026-09-12-user-bio");
	for (const fresh of [false, true]) {
		const database = new SQL.Database();
		database.exec(fresh ? schema : schema.replace(/ {2}bio TEXT NOT NULL DEFAULT '',\r?\n/, ""));
		database.run("INSERT INTO users (username, display_name, password_hash, password_salt) VALUES ('legacy', 'Legacy', 'hash', 'salt')");
		const options = {
			migrations: [migration], appliedMigrations: new Map(),
			artifacts: new Set(fresh ? ["column:users.bio"] : []),
			readSql: (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
		};
		const first = await buildD1MigrationPlan(options);
		assert.equal(first.decisions[0].action, fresh ? "baseline" : "apply");
		database.exec(first.sql);
		assert.equal(database.exec("SELECT bio FROM users")[0].values[0][0], "");
		database.run("UPDATE users SET bio = 'keep me'");
		const ledger = new Map(database.exec("SELECT migration_id, checksum FROM edgechat_schema_migrations")[0].values);
		const repeated = await buildD1MigrationPlan({ ...options, appliedMigrations: ledger, artifacts: new Set(["column:users.bio"]) });
		assert.equal(repeated.decisions[0].action, "skip");
		database.exec(repeated.sql);
		assert.equal(database.exec("SELECT bio FROM users")[0].values[0][0], "keep me");
		assert.equal(database.exec("SELECT display_name FROM users")[0].values[0][0], "Legacy");
	}
});
