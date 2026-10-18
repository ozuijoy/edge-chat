import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/src/index.js";

test("个人资料接口清除头像时同步数据库与会话", async () => {
	let storedSession = {
		token: "session-token",
		userId: 7,
		username: "alice",
		displayName: "Alice",
		avatarUrl: "/files/7%2Fold.png",
		isAdmin: false,
		sessionVersion: 0,
	};
	let update;
	const env = {
		SESSIONS: {
			async get() {
				return JSON.stringify(storedSession);
			},
			async put(_token, value) {
				storedSession = JSON.parse(value);
			},
		},
		DB: {
			prepare(sql) {
					if (sql.includes("FROM site_settings")) return { async all() { return { results: [] }; } };
				return {
					bind(...binds) {
						return {
								async all() {
									if (sql.includes("SELECT id, username, display_name, avatar_key, bio")) {
										return { results: [{ id: 7, username: "alice", display_name: "Alice", avatar_key: null, bio: "" }] };
									}
                if (sql.includes("SELECT u.username, u.is_disabled")) {
									return {
										results: [{
											username: "alice",
											is_disabled: 0,
											deleted_at: null,
											session_version: 0,
											is_super_admin: 0,
										}],
									};
								}
								throw new Error(`Unexpected query: ${sql}`);
							},
							async run() {
								update = { sql, binds };
								return { success: true };
							},
						};
					},
				};
			},
		},
	};

	const response = await worker.fetch(
		new Request("https://edgechat.test/api/me/profile", {
			method: "PATCH",
			headers: {
				Authorization: "Bearer session-token",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ displayName: "Alice", avatarKey: null }),
		}),
		env,
		{},
	);

	assert.equal(response.status, 200);
	assert.match(update.sql, /avatar_key = \?/);
	assert.deepEqual(update.binds, ["Alice", null, 7]);
	assert.equal((await response.json()).session.avatarUrl, "");
	assert.equal(storedSession.avatarUrl, "");
});
