import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";

import { registerChannelRoutes } from "../worker/src/api/channels.js";
import {
	GENERAL_CHANNEL_NAME,
	ensureGeneralChannelMembership,
	isGeneralChannel,
	isReservedGeneralChannelName,
} from "../worker/src/data/general-channel.js";

function createBatchDb() {
	const statements = [];
	return {
		statements,
		db: {
			prepare(sql) {
				const statement = {
					sql,
					binds: [],
					bind(...binds) {
						this.binds = binds;
						return this;
					},
				};
				statements.push(statement);
				return statement;
			},
			async batch(batchStatements) {
				assert.deepEqual(batchStatements, statements);
				return [];
			},
		},
	};
}

function createRouteHarness(resultSets = []) {
	const calls = [];
	let resultIndex = 0;
	const db = {
		prepare(sql) {
			const call = { sql, binds: [], ran: false };
			calls.push(call);
			return {
				bind(...binds) {
					call.binds = binds;
					return this;
				},
				async all() {
					return { results: resultSets[resultIndex++] || [] };
				},
				async run() {
					call.ran = true;
					return { meta: {} };
				},
			};
		},
		async batch() {
			return [];
		},
	};
	const app = new Hono();
	app.use("*", async (c, next) => {
		c.set("session", { userId: 1, displayName: "Admin", isAdmin: true });
		await next();
	});
	registerChannelRoutes(app);

	return {
		calls,
		request(path, init) {
			return app.fetch(new Request(`https://example.com${path}`, init), { DB: db });
		},
	};
}

test("general 辅助模块使用幂等 SQL 创建系统群并修复当前成员", async () => {
	const { db, statements } = createBatchDb();
	await ensureGeneralChannelMembership(db, "7");

	assert.equal(statements.length, 2);
	assert.match(statements[0].sql, /INSERT OR IGNORE INTO channels/);
	assert.deepEqual(statements[0].binds, [GENERAL_CHANNEL_NAME]);
	assert.match(statements[1].sql, /INSERT OR IGNORE INTO channel_members/);
	assert.match(statements[1].sql, /c\.name = \?/);
	assert.deepEqual(statements[1].binds, [7, GENERAL_CHANNEL_NAME]);
	await assert.rejects(() => ensureGeneralChannelMembership(db, 0), TypeError);
});

test("general 系统群识别与数据库保持精确一致", () => {
	assert.equal(isGeneralChannel({ name: "general", kind: "public" }), true);
	assert.equal(isGeneralChannel({ name: "GENERAL", kind: "private" }), false);
	assert.equal(isGeneralChannel({ name: "general", kind: "dm" }), false);
	assert.equal(isGeneralChannel({ name: "team", kind: "public" }), false);
	assert.equal(isReservedGeneralChannelName(" General "), true);
	assert.equal(isReservedGeneralChannelName("team"), false);
});

test("频道 API 拒绝创建 general 的大小写变体", async () => {
	const harness = createRouteHarness();
	const response = await harness.request("/api/channels", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "General", kind: "public" }),
	});

	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), { error: "general 是系统群组名称" });
	assert.equal(harness.calls.length, 0);
});

test("成员管理与两个删除入口都会保护 general", async () => {
	for (const [path, expectedError] of [
		["/api/channels/1/members/2", "general 系统群组必须保留所有成员"],
		["/api/channels/1", "general 系统群组不能删除"],
		["/api/admin/channels/1", "general 系统群组不能删除"],
	]) {
			const harness = createRouteHarness([[{ id: 1, name: "general", kind: "public" }], [{ role: 'owner' }]]);
		const response = await harness.request(path, { method: "DELETE" });
		assert.equal(response.status, 400);
		assert.deepEqual(await response.json(), { error: expectedError });
			assert.equal(harness.calls.length, path.includes('/admin/') ? 1 : 2);
		assert.equal(harness.calls[0].ran, false);
	}
});

test("general 允许更新头像但拒绝改名", async () => {
	const harness = createRouteHarness([[{ id: 1, name: "general", kind: "public" }], [{ role: 'owner' }]]);
	const response = await harness.request("/api/channels/1", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "announcements" }),
	});

	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), { error: "general 系统群组不能改名" });
	assert.equal(harness.calls.length, 2);
});
