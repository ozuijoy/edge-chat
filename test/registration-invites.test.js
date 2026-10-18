import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ApiError } from "../worker/src/errors.js";
import {
	createRegistrationInvite,
	createUserWithRegistrationInvite,
	getAvailableRegistrationInvite,
	listActiveRegistrationInvites,
} from "../worker/src/data/registration-invites.js";

function createStatementDb(handlers = {}) {
	const calls = [];
	const db = {
		prepare(sql) {
			const call = { sql, binds: [] };
			calls.push(call);
			return {
				bind(...binds) {
					call.binds = binds;
					return this;
				},
				async all() {
					return handlers.all?.(call) ?? { results: [] };
				},
				async first() {
					return handlers.first?.(call) ?? null;
				},
				async run() {
					return handlers.run?.(call) ?? { meta: { last_row_id: 1 } };
				},
			};
		},
		async batch(statements) {
			return handlers.batch?.(statements, calls) ?? [];
		},
	};

	return { db, calls };
}

test("管理端邀请列表返回已用、总量和剩余次数", async () => {
	const { db, calls } = createStatementDb({
		all() {
			return {
				results: [
					{
						id: 7,
						token: "token",
						note: "测试邀请",
						max_uses: 5,
						used_count: 2,
						created_at: "2026-07-29 00:00:00",
						consumed_at: null,
						deleted_at: null,
						creator_display_name: "Admin",
						consumer_display_name: "Latest User",
					},
				],
			};
		},
	});

	const invites = await listActiveRegistrationInvites(db);

	assert.equal(invites.length, 1);
	assert.equal(invites[0].maxUses, 5);
	assert.equal(invites[0].usedCount, 2);
	assert.equal(invites[0].remainingUses, 3);
	assert.equal(invites[0].isAvailable, true);
	assert.match(calls[0].sql, /ri\.used_count < ri\.max_uses/);
});

test("创建邀请时保存管理员设置的最大使用次数", async () => {
	const { db, calls } = createStatementDb({
		run() {
			return { meta: { last_row_id: 18 } };
		},
	});

	const invite = await createRegistrationInvite(db, {
		token: "created-token",
		note: "五人入口",
		maxUses: 5,
		createdBy: 1,
		creatorDisplayName: "Admin",
	});

	assert.match(calls[0].sql, /max_uses/);
	assert.deepEqual(calls[0].binds, ["created-token", "五人入口", 5, 1]);
	assert.equal(invite.maxUses, 5);
	assert.equal(invite.usedCount, 0);
	assert.equal(invite.remainingUses, 5);
});

test("公开邀请只返回仍有剩余次数的链接", async () => {
	const { db, calls } = createStatementDb({
		first() {
			return {
				id: 9,
				note: "三人入口",
				max_uses: 3,
				used_count: 1,
				created_at: "2026-07-29 00:00:00",
			};
		},
	});

	const invite = await getAvailableRegistrationInvite(db, "public-token");

	assert.equal(invite.remainingUses, 2);
	assert.deepEqual(calls[0].binds, ["public-token"]);
	assert.match(calls[0].sql, /deleted_at IS NULL/);
	assert.match(calls[0].sql, /used_count < max_uses/);
});

test("邀请注册通过原子批处理同时创建用户和登记使用记录", async () => {
	const { db, calls } = createStatementDb({
		batch(statements) {
			assert.equal(statements.length, 2);
			return [{ meta: { last_row_id: 23 } }, { meta: { changes: 1 } }];
		},
	});

	const userId = await createUserWithRegistrationInvite(db, {
		inviteId: 4,
		username: "new-user",
		displayName: "New User",
		passwordHash: "hash",
		passwordSalt: "salt",
	});

	assert.equal(userId, 23);
	assert.match(calls[0].sql, /INSERT INTO users/);
	assert.match(calls[1].sql, /INSERT INTO registration_invite_uses/);
	assert.deepEqual(calls[1].binds, [4, "new-user"]);
});

test("邀请额度耗尽和用户名重复返回稳定的公开错误", async () => {
	for (const [databaseMessage, publicMessage] of [
		["REGISTRATION_INVITE_UNAVAILABLE", "注册链接已失效"],
		["UNIQUE constraint failed: users.username", "用户名已存在"],
	]) {
		const { db } = createStatementDb({
			batch() {
				throw new Error(databaseMessage);
			},
		});

		await assert.rejects(
			() =>
				createUserWithRegistrationInvite(db, {
					inviteId: 4,
					username: "new-user",
					displayName: "New User",
					passwordHash: "hash",
					passwordSalt: "salt",
				}),
			(error) => error instanceof ApiError && error.message === publicMessage,
		);
	}
});

test("数据库与后台界面完整声明可使用次数能力", () => {
	const schema = readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8");
	const migration = readFileSync(
		new URL("../worker/migrations/2026-07-29-registration-invite-usage.sql", import.meta.url),
		"utf8",
	);
	const inviteManager = readFileSync(
		new URL("../frontend/src/components/admin/RegistrationInviteManager.vue", import.meta.url),
		"utf8",
	);
	const adminInvitesPage = readFileSync(
		new URL("../frontend/src/pages/AdminInvitesPage.vue", import.meta.url),
		"utf8",
	);
	const adminUsersPage = readFileSync(
		new URL("../frontend/src/pages/AdminUsersPage.vue", import.meta.url),
		"utf8",
	);
	const adminSitePage = readFileSync(
		new URL("../frontend/src/pages/AdminSitePage.vue", import.meta.url),
		"utf8",
	);
	const adminApi = readFileSync(new URL("../worker/src/api/admin.js", import.meta.url), "utf8");

	for (const sql of [schema, migration]) {
		assert.match(sql, /max_uses INTEGER NOT NULL DEFAULT 1/);
		assert.match(sql, /used_count INTEGER NOT NULL DEFAULT 0/);
		assert.match(sql, /CREATE TRIGGER IF NOT EXISTS validate_registration_invite_use/);
		assert.match(sql, /REGISTRATION_INVITE_UNAVAILABLE/);
	}
		assert.match(inviteManager, /v-model\.number="inviteForm\.maxUses"/);
		assert.match(inviteManager, /min="1"[\s\S]*max="1000"[\s\S]*step="1"/);
			assert.match(inviteManager, /t\('invites\.usage', \{ used: invite\.usedCount, max: invite\.maxUses \}\)/);
			assert.match(inviteManager, /t\('invites\.createdCount', \{ count: invites\.length \}\)/);
		assert.match(inviteManager, /admin-invite-card__status/);
		assert.match(adminInvitesPage, /import RegistrationInviteManager/);
	assert.match(adminInvitesPage, /<RegistrationInviteManager \/>/);
	assert.doesNotMatch(adminSitePage, /RegistrationInviteManager|注册链接/);
	assert.doesNotMatch(adminUsersPage, /RegistrationInviteManager|注册链接|创建用户/);
	assert.doesNotMatch(adminInvitesPage, /创建一次性注册链接|限 1 人注册/);
	assert.match(adminApi, /可使用次数必须是 1 到 \$\{MAX_INVITE_USES\} 之间的整数/);
});
