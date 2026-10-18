import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import initSqlJs from "sql.js";

import { listVisibleChannels } from "../worker/src/data/channels.js";
import { listUserDms } from "../worker/src/data/dm-queries.js";
import {
	insertMessage,
	listMessages,
	softDeleteMessage,
} from "../worker/src/data/messages.js";
import { countUnreadAttention, markRoomRead } from "../worker/src/data/unread.js";
import {
	MessageSubmissionError,
	submitRoomMessage,
} from "../worker/src/message-submission.js";
import { createD1Adapter } from "./support/d1.js";

const SQL = await initSqlJs();

function encodedKey() {
	return Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index + 1)).toString("base64");
}

function createEnvironment() {
	const database = new SQL.Database();
	database.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
	return {
		database,
		env: {
			DB: createD1Adapter(database),
			EDGECHAT_ENCRYPTION_KEYRING: JSON.stringify({
				activeKeyId: "test-v1",
				keys: { "test-v1": encodedKey() },
			}),
		},
	};
}

function insertUser(database, username, displayName = username) {
	database.run(
		"INSERT INTO users (username, display_name, password_hash, password_salt) VALUES (?, ?, 'hash', 'salt')",
		[username, displayName],
	);
	return Number(database.exec("SELECT last_insert_rowid()")[0].values[0][0]);
}

function createRoom(database, { kind, name, userIds, dmKey = null }) {
	database.run(
		"INSERT INTO channels (name, kind, dm_key, created_by) VALUES (?, ?, ?, ?)",
		[name, kind, dmKey, userIds[0]],
	);
	const channelId = Number(database.exec("SELECT last_insert_rowid()")[0].values[0][0]);
	for (const [index, userId] of userIds.entries()) {
		database.run(
			"INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, ?)",
			[channelId, userId, index === 0 ? "owner" : "member"],
		);
	}
	return channelId;
}

test("回复关系只接受同房间存活消息，并返回可点击的解密引用预览", async () => {
	const { database, env } = createEnvironment();
	const aliceId = insertUser(database, "alice", "Alice");
	const bobId = insertUser(database, "bob", "Bob");
	const generalId = Number(database.exec("SELECT id FROM channels WHERE name = 'general'")[0].values[0][0]);
	const otherRoomId = createRoom(database, {
		kind: "private",
		name: "other-room",
		userIds: [aliceId, bobId],
	});
	const original = await insertMessage(env, {
		channelId: generalId,
		senderId: aliceId,
		content: "需要确认的原消息",
	});
	const otherMessage = await insertMessage(env, {
		channelId: otherRoomId,
		senderId: aliceId,
		content: "另一个房间",
	});

	const result = await submitRoomMessage(
		env,
		{ room: { id: generalId, kind: "public" }, principal: { userId: bobId } },
		{ content: "已经确认", replyMessageId: original.id },
	);
	assert.equal(result.message.replyToMessageId, original.id);
	assert.deepEqual(result.message.replyTo, {
		id: original.id,
		deleted: false,
		content: "需要确认的原消息",
		sender: {
			kind: "local",
			id: aliceId,
			username: "alice",
			displayName: "Alice",
			avatarUrl: "",
			source: "edgechat",
		},
		attachment: null,
	});
	const storedReply = database.exec(
		`SELECT reply_to_message_id, reply_to_sender_id FROM messages WHERE id = ${result.message.id}`,
	)[0].values[0];
	assert.deepEqual(storedReply, [original.id, aliceId]);
	assert.equal(await countUnreadAttention(env.DB, { channelId: generalId, userId: aliceId }), 1);
	assert.equal(
		(await listVisibleChannels(env.DB, aliceId)).find((channel) => channel.id === generalId)
			.mentionUnreadCount,
		1,
	);

	await assert.rejects(
		submitRoomMessage(
			env,
			{ room: { id: generalId, kind: "public" }, principal: { userId: bobId } },
			{ content: "跨房间回复", replyMessageId: otherMessage.id },
		),
		(error) => error instanceof MessageSubmissionError && error.code === "reply_message_unavailable",
	);

	await softDeleteMessage(env.DB, { channelId: generalId, messageId: original.id });
	const visibleReply = (await listMessages(env, generalId)).find(
		(message) => Number(message.id) === Number(result.message.id),
	);
	assert.deepEqual(visibleReply.replyTo, { id: original.id, deleted: true });
	assert.equal(await countUnreadAttention(env.DB, { channelId: generalId, userId: aliceId }), 1);
	await assert.rejects(
		submitRoomMessage(
			env,
			{ room: { id: generalId, kind: "public" }, principal: { userId: bobId } },
			{ content: "不能回复已删除消息", replyMessageId: original.id },
		),
		(error) => error instanceof MessageSubmissionError && error.code === "reply_message_unavailable",
	);
});

test("私信回复复用有人@我计数，并随统一已读游标清零", async () => {
	const { database, env } = createEnvironment();
	const aliceId = insertUser(database, "alice", "Alice");
	const bobId = insertUser(database, "bob", "Bob");
	const dmId = createRoom(database, {
		kind: "dm",
		name: "dm",
		dmKey: `${Math.min(aliceId, bobId)}:${Math.max(aliceId, bobId)}`,
		userIds: [aliceId, bobId],
	});
	const original = await insertMessage(env, {
		channelId: dmId,
		senderId: aliceId,
		content: "私信原消息",
	});
	const reply = await submitRoomMessage(
		env,
		{ room: { id: dmId, kind: "dm" }, principal: { userId: bobId } },
		{ content: "私信回复", replyMessageId: original.id },
	);

	assert.equal((await listUserDms(env.DB, aliceId))[0].mentionUnreadCount, 1);
	await markRoomRead(env.DB, { channelId: dmId, userId: aliceId, messageId: reply.message.id });
	assert.equal((await listUserDms(env.DB, aliceId))[0].mentionUnreadCount, 0);
});
