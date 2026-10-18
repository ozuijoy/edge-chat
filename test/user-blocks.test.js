import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import initSqlJs from "sql.js";

import { listUserDms } from "../worker/src/data/dm-queries.js";
import {
	getUserBlockStatus,
	setUserBlocked,
} from "../worker/src/data/user-blocks.ts";
import {
	MessageSubmissionError,
	submitRoomMessage,
} from "../worker/src/message-submission.js";
import { createD1Adapter } from "./support/d1.js";

const SQL = await initSqlJs();

function encodedKey() {
	return Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index + 1)).toString(
		"base64",
	);
}

function insertUser(database, username) {
	database.run(
		"INSERT INTO users (username, display_name, password_hash, password_salt) VALUES (?, ?, 'hash', 'salt')",
		[username, username],
	);
	return Number(database.exec("SELECT last_insert_rowid()")[0].values[0][0]);
}

function createDm(database, firstUserId, secondUserId) {
	const dmKey = `${Math.min(firstUserId, secondUserId)}:${Math.max(firstUserId, secondUserId)}`;
	database.run(
		"INSERT INTO channels (name, kind, dm_key, created_by) VALUES (?, 'dm', ?, ?)",
		[`dm:${dmKey}`, dmKey, firstUserId],
	);
	const channelId = Number(database.exec("SELECT last_insert_rowid()")[0].values[0][0]);
	database.run(
		"INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?), (?, ?)",
		[channelId, firstUserId, channelId, secondUserId],
	);
	return channelId;
}

test("用户拉黑关系按方向保存，并统一阻断双方私信发送", async () => {
	const database = new SQL.Database();
	database.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
	const aliceId = insertUser(database, "alice");
	const bobId = insertUser(database, "bob");
	const dmId = createDm(database, aliceId, bobId);
	const env = {
		DB: createD1Adapter(database),
		EDGECHAT_ENCRYPTION_KEYRING: JSON.stringify({
			activeKeyId: "test-v1",
			keys: { "test-v1": encodedKey() },
		}),
	};

	assert.deepEqual(await getUserBlockStatus(env.DB, aliceId, bobId), {
		targetExists: true,
		blockedByMe: false,
		blockedMe: false,
	});

	await setUserBlocked(env.DB, aliceId, bobId, true);
	assert.equal((await listUserDms(env.DB, aliceId))[0].isBlockedByMe, true);
	assert.deepEqual(await getUserBlockStatus(env.DB, bobId, aliceId), {
		targetExists: true,
		blockedByMe: false,
		blockedMe: true,
	});

	await assert.rejects(
		submitRoomMessage(
			env,
			{ room: { id: dmId, kind: "dm" }, principal: { userId: bobId } },
			{ content: "hello" },
		),
		(error) =>
			error instanceof MessageSubmissionError &&
			error.code === "blocked_by_recipient" &&
			error.status === 403 &&
			error.message === "发送被拒，你已经被拉黑",
	);
	await assert.rejects(
		submitRoomMessage(
			env,
			{ room: { id: dmId, kind: "dm" }, principal: { userId: aliceId } },
			{ content: "hello" },
		),
		(error) =>
			error instanceof MessageSubmissionError && error.code === "recipient_blocked",
	);

	await setUserBlocked(env.DB, aliceId, bobId, false);
	const sent = await submitRoomMessage(
		env,
		{ room: { id: dmId, kind: "dm" }, principal: { userId: bobId } },
		{ content: "恢复发送" },
	);
	assert.equal(sent.message.content, "恢复发送");
	assert.equal((await listUserDms(env.DB, aliceId))[0].isBlockedByMe, false);
});
