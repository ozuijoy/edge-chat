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

test("消息軟刪除限定消息與房間，並保留記錄供後續清理", async () => {
	const { db, capture } = createMutationDb();

	assert.equal(await softDeleteMessage(db, { channelId: "4", messageId: "9" }), true);
	assert.deepEqual(capture.binds, [9, 4]);
	assert.match(capture.sql, /SET deleted_at = CURRENT_TIMESTAMP/);
	assert.match(capture.sql, /AND deleted_at IS NULL/);
});

test("消息刪除統一完成權限校驗、持久化與實時刪除 packet", async () => {
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

test("消息刪除後會回收不再引用的附件", async () => {
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

test("消息刪除向客戶端收斂無權限、無效參數與重複刪除錯誤", async () => {
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
		(error) => error instanceof MessageDeletionError && error.message === "無權刪除該消息",
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
			error instanceof MessageDeletionError && error.message === "消息不存在或已被刪除",
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
