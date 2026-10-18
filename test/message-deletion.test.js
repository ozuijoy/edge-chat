import assert from "node:assert/strict";
import test from "node:test";

import { softDeleteMessage } from "../worker/src/data/messages.js";
import {
	createMessageDeletion,
	MessageDeletionError,
} from "../worker/src/message-deletion.js";

function createMutationDb(changes = 1) {
	const capture = { sql: "", binds: [] };
	return {
		capture,
		db: {
			prepare(sql) {
				capture.sql = sql;
				return {
					bind(...binds) {
						capture.binds = binds;
						return this;
					},
					async run() {
						return { meta: { changes } };
					},
				};
			},
		},
	};
}

test("消息软删除限定消息与房间，并保留记录供后续清理", async () => {
	const { db, capture } = createMutationDb();

	assert.equal(await softDeleteMessage(db, { channelId: "4", messageId: "9" }), true);
	assert.deepEqual(capture.binds, [9, 4]);
	assert.match(capture.sql, /SET deleted_at = CURRENT_TIMESTAMP/);
	assert.match(capture.sql, /AND deleted_at IS NULL/);
});

test("消息删除统一完成权限校验、持久化与实时删除 packet", async () => {
	const calls = [];
	const remove = createMessageDeletion({
		async authorize(db, principal, kind, roomId) {
			calls.push({ type: "authorize", db, principal, kind, roomId });
			return { ok: true };
		},
		async persistDeletion(db, args) {
			calls.push({ type: "persist", db, args });
			return true;
		},
	});
	const db = {};
	const result = await remove(
		{ DB: db },
		{ room: { id: 4, kind: "private" }, principal: { userId: 7 } },
		{ messageId: "9" },
	);

	assert.deepEqual(calls, [
		{
			type: "authorize",
			db,
			principal: { userId: 7 },
			kind: "private",
			roomId: 4,
		},
		{ type: "persist", db, args: { channelId: 4, messageId: 9 } },
	]);
	assert.deepEqual(JSON.parse(result.packet), {
		protocolVersion: 1,
		type: "message_deleted",
		messageId: 9,
	});
});

test("消息删除后会回收不再引用的附件", async () => {
	const cleaned = [];
	const remove = createMessageDeletion({
		async authorize() {
			return { ok: true };
		},
		async getDeletionTarget() {
			return { attachment_key: "7/voice.webm" };
		},
		async persistDeletion() {
			return true;
		},
		async cleanupAttachments(env, keys) {
			cleaned.push({ env, keys });
		},
	});
	const env = { DB: {}, FILES: {} };

	const result = await remove(
		env,
		{ room: { id: 4, kind: "private" }, principal: { userId: 7 } },
		{ messageId: 9 },
	);
	await result.cleanupPromise;

	assert.deepEqual(cleaned, [{ env, keys: ["7/voice.webm"] }]);
});

test("消息删除向客户端收敛无权限、无效参数与重复删除错误", async () => {
	const denied = createMessageDeletion({
		async authorize() {
			return { ok: false };
		},
	});
	await assert.rejects(
		denied(
			{ DB: {} },
			{ room: { id: 4, kind: "private" }, principal: { userId: 7 } },
			{ messageId: 9 },
		),
		(error) => error instanceof MessageDeletionError && error.message === "无权删除该消息",
	);

	const missing = createMessageDeletion({
		async authorize() {
			return { ok: true };
		},
		async persistDeletion() {
			return false;
		},
	});
	await assert.rejects(
		missing(
			{ DB: {} },
			{ room: { id: 4, kind: "private" }, principal: { userId: 7 } },
			{ messageId: 9 },
		),
		(error) =>
			error instanceof MessageDeletionError && error.message === "消息不存在或已被删除",
	);

	await assert.rejects(
		missing(
			{ DB: {} },
			{ room: { id: 4, kind: "private" }, principal: { userId: 7 } },
			{ messageId: 0 },
		),
		(error) => error instanceof MessageDeletionError && error.message === "消息不存在",
	);
});
