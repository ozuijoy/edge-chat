import assert from "node:assert/strict";
import test from "node:test";

import {
	ROOM_ACCESS_FAILURE,
	authorizeChannelManagement,
	authorizeMessageModeration,
	authorizeRoom,
	getChannelById,
	getChannelMembership,
	isRoomKind,
} from "../worker/src/room-access.js";

function createQueryQueue(resultSets = []) {
	const calls = [];
	let index = 0;
	return {
		calls,
		db: {
			prepare(sql) {
				const call = { sql, binds: [] };
				calls.push(call);
				return {
					bind(...binds) {
						call.binds = binds;
						return this;
					},
					async all() {
						return { results: resultSets[index++] || [] };
					},
				};
			},
		},
	};
}

test("room kind 与基础查询拒绝无效身份参数", async () => {
	assert.equal(isRoomKind("public"), true);
	assert.equal(isRoomKind("private"), true);
	assert.equal(isRoomKind("dm"), true);
	assert.equal(isRoomKind("other"), false);
	const harness = createQueryQueue();
	assert.equal(await getChannelById(harness.db, "invalid"), null);
	assert.equal(await getChannelById(harness.db, 0), null);
	assert.equal(await getChannelMembership(harness.db, 1, "invalid"), null);
	assert.equal(await getChannelMembership(harness.db, 1, -2), null);
	assert.equal(harness.calls.length, 0);
});

test("普通成员与管理员走稳定的 authorizeRoom decision surface", async () => {
	const member = createQueryQueue([[{ id: 5, kind: "private" }]]);
	const memberAccess = await authorizeRoom(member.db, { userId: "7" }, "private", "5");
	assert.equal(memberAccess.ok, true);
	assert.deepEqual(member.calls[0].binds, [5, "private", 7]);
	assert.deepEqual(memberAccess.identity, { userId: 7 });

	const admin = createQueryQueue([[{ id: 5, kind: "private" }]]);
	const adminAccess = await authorizeRoom(admin.db, { userId: 7, isAdmin: true }, "private", 5);
	assert.equal(adminAccess.ok, true);
	assert.deepEqual(admin.calls[0].binds, [5, "private", 7]);
	assert.deepEqual(adminAccess.identity, { userId: 7 });
});

test("authorizeRoom 对非法、未找到与无成员资格返回稳定失败原因", async () => {
	assert.deepEqual(await authorizeRoom({}, null, "private", 1), {
		ok: false,
		reason: ROOM_ACCESS_FAILURE.INVALID_ROOM,
	});
	assert.deepEqual(await authorizeRoom({}, { userId: 0 }, "private", 1), {
		ok: false,
		reason: ROOM_ACCESS_FAILURE.INVALID_ROOM,
	});
	assert.deepEqual(await authorizeRoom({}, { userId: 1 }, "private", 0), {
		ok: false,
		reason: ROOM_ACCESS_FAILURE.INVALID_ROOM,
	});
	const member = createQueryQueue([[]]);
	assert.deepEqual(await authorizeRoom(member.db, { userId: 7 }, "public", 5), {
		ok: false,
		reason: ROOM_ACCESS_FAILURE.FORBIDDEN,
	});
	const admin = createQueryQueue([[]]);
	assert.deepEqual(await authorizeRoom(admin.db, { userId: 1, isAdmin: true }, "public", 5), {
		ok: false,
		reason: ROOM_ACCESS_FAILURE.FORBIDDEN,
	});
});

test("频道管理只允许管理员或 owner，并拒绝 DM", async () => {
	const owner = createQueryQueue([
		[{ id: 5, kind: "private" }],
		[{ channel_id: 5, user_id: 7, role: "owner" }],
	]);
	const ownerAccess = await authorizeChannelManagement(owner.db, { userId: 7 }, 5);
	assert.equal(ownerAccess.ok, true);
	assert.equal(ownerAccess.membership.role, "owner");
	assert.deepEqual(owner.calls.map((call) => call.binds), [[5], [5, 7]]);

	const nonOwner = createQueryQueue([
		[{ id: 5, kind: "private" }],
		[{ role: "member" }],
	]);
	assert.deepEqual(await authorizeChannelManagement(nonOwner.db, { userId: 7 }, 5), {
		ok: false,
		reason: ROOM_ACCESS_FAILURE.FORBIDDEN,
	});

	const directMessage = createQueryQueue([[{ id: 8, kind: "dm" }]]);
	assert.deepEqual(await authorizeChannelManagement(directMessage.db, { userId: 1, isAdmin: true }, 8), {
		ok: false,
		reason: ROOM_ACCESS_FAILURE.NOT_FOUND,
	});
});

test("后台身份不授予消息管理权限，私信不可删除且群消息仍须群主", async () => {
	const adminDm = createQueryQueue([[{ id: 8, kind: "dm" }]]);
	const adminAccess = await authorizeMessageModeration(
		adminDm.db,
		{ userId: 1, isAdmin: true },
		"dm",
		8,
	);
	assert.equal(adminAccess.ok, false);
	assert.deepEqual(adminDm.calls.map((call) => call.binds), [[8, "dm", 1]]);

	const owner = createQueryQueue([
		[{ id: 5, kind: "private" }],
		[{ channel_id: 5, user_id: 7, role: "owner" }],
	]);
	const ownerAccess = await authorizeMessageModeration(
		owner.db,
		{ userId: 7 },
		"private",
		5,
	);
	assert.equal(ownerAccess.ok, true);
	assert.equal(ownerAccess.membership.role, "owner");

	const member = createQueryQueue([
		[{ id: 5, kind: "private" }],
		[{ role: "member" }],
	]);
	assert.deepEqual(
		await authorizeMessageModeration(member.db, { userId: 7 }, "private", 5),
		{ ok: false, reason: ROOM_ACCESS_FAILURE.FORBIDDEN },
	);

	const directMessage = createQueryQueue([[{ id: 8, kind: "dm" }]]);
	assert.deepEqual(
		await authorizeMessageModeration(directMessage.db, { userId: 7 }, "dm", 8),
		{ ok: false, reason: ROOM_ACCESS_FAILURE.FORBIDDEN },
	);
});
