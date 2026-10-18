import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import initSqlJs from "sql.js";

import { listVisibleChannels } from "../worker/src/data/channels.js";
import {
	insertMessage,
	listMessages,
} from "../worker/src/data/messages.js";
import {
	contentMentionsUsername,
	normalizeMentionUserIds,
	resolveMessageMentionUserIds,
} from "../worker/src/data/mentions.js";
import { countUnreadMentions, markRoomRead } from "../worker/src/data/unread.js";
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

test("提及文本使用完整用户名边界并去重候选 ID", () => {
	assert.equal(contentMentionsUsername("hi @alice, please review", "alice"), true);
	assert.equal(contentMentionsUsername("mail@example.com", "example.com"), false);
	assert.equal(contentMentionsUsername("@alice2", "alice"), false);
	assert.deepEqual(normalizeMentionUserIds([2, "2", 3, 0, -1, "bad"]), [2, 3]);
});

test("服务端只保留正文真实出现且仍属于当前群的提及", async () => {
	const { database, env } = createEnvironment();
	const senderId = insertUser(database, "alice", "Alice");
	const bobId = insertUser(database, "bob", "Bob");
	const carolId = insertUser(database, "carol", "Carol");
	database.run("INSERT INTO channels (name, kind, created_by) VALUES ('mentions', 'private', ?)", [senderId]);
	const channelId = Number(database.exec("SELECT last_insert_rowid()")[0].values[0][0]);
	database.run(
		"INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner'), (?, ?, 'member')",
		[channelId, senderId, channelId, bobId],
	);

	const mentionUserIds = await resolveMessageMentionUserIds(env.DB, {
		channelId,
		roomKind: "public",
		senderId,
		content: "@bob 请看，carol 没有被真实提及",
		candidateUserIds: [senderId, bobId, carolId, 999],
	});
	assert.deepEqual(mentionUserIds, [bobId]);
	assert.deepEqual(
		await resolveMessageMentionUserIds(env.DB, {
			channelId,
			roomKind: "dm",
			senderId,
			content: "@bob",
			candidateUserIds: [bobId],
		}),
		[],
	);
});

test("消息提及随历史消息返回，并基于已读游标清除会话标志", async () => {
	const { database, env } = createEnvironment();
	const senderId = insertUser(database, "alice", "Alice");
	const bobId = insertUser(database, "bob", "Bob");
	const channelId = Number(database.exec("SELECT id FROM channels WHERE name = 'general'")[0].values[0][0]);

	const message = await insertMessage(env, {
		channelId,
		senderId,
		content: "@bob hello",
		mentionUserIds: [bobId],
	});
	assert.deepEqual(message.mentionUserIds, [bobId]);
	assert.equal(message.mentions[0].username, "bob");
	assert.equal((await listMessages(env, channelId)).at(-1).mentions[0].displayName, "Bob");
	assert.equal(await countUnreadMentions(env.DB, { channelId, userId: bobId }), 1);
	const channel = (await listVisibleChannels(env.DB, bobId)).find((item) => item.id === channelId);
	assert.equal(channel.mentionUnreadCount, 1);

	await markRoomRead(env.DB, { channelId, userId: bobId, messageId: message.id });
	assert.equal(await countUnreadMentions(env.DB, { channelId, userId: bobId }), 0);
	assert.equal(
		(await listVisibleChannels(env.DB, bobId)).find((item) => item.id === channelId).mentionUnreadCount,
		0,
	);
});
