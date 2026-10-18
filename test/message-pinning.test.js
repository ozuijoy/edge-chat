import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import initSqlJs from "sql.js";

import { getPinnedMessage, pinMessage } from "../worker/src/data/pins.js";
import { softDeleteMessage } from "../worker/src/data/messages.js";
import {
	MessagePinningError,
	pinRoomMessage,
	unpinRoomMessage,
} from "../worker/src/message-pinning.js";
import { createD1Adapter } from "./support/d1.js";

const SQL = await initSqlJs();
const schema = readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8");

function createEnvironment() {
	const database = new SQL.Database();
	database.exec(schema);
	database.run(
		`INSERT INTO users (id, username, display_name, password_hash, password_salt, is_admin)
		 VALUES
		   (1, 'admin', 'Admin', 'hash', 'salt', 1),
		   (2, 'owner', 'Owner', 'hash', 'salt', 0),
		   (3, 'member', 'Member', 'hash', 'salt', 0)`,
	);
	database.run(
		`INSERT INTO channels (id, name, kind, dm_key, created_by)
		 VALUES
		   (2, 'team', 'private', NULL, 2),
		   (3, 'dm-room', 'dm', '2:3', 2)`,
	);
	database.run(
		`INSERT INTO channel_members (channel_id, user_id, role)
		 VALUES (2, 2, 'owner'), (2, 3, 'member'), (3, 2, 'member'), (3, 3, 'member')`,
	);
	database.run(
		`INSERT INTO messages (id, channel_id, sender_id, content)
		 VALUES (10, 2, 2, 'first'), (11, 2, 3, 'second'), (12, 3, 2, 'dm')`,
	);
	return { database, env: { DB: createD1Adapter(database) } };
}

function countPins(database) {
	return Number(database.exec("SELECT COUNT(*) FROM channel_pins")[0].values[0][0]);
}

test("置頂引用隨消息軟刪除和硬刪除清理，但不改變消息保留策略", async () => {
	const { database, env } = createEnvironment();

	assert.equal(
		await pinMessage(env.DB, { channelId: 2, messageId: 10, pinnedBy: 2 }),
		true,
	);
	assert.equal((await getPinnedMessage(env, 2)).content, "first");
	assert.equal(await softDeleteMessage(env.DB, { channelId: 2, messageId: 10 }), true);
	assert.equal(countPins(database), 0);

	assert.equal(
		await pinMessage(env.DB, { channelId: 2, messageId: 11, pinnedBy: 2 }),
		true,
	);
	database.run("DELETE FROM messages WHERE id = 11");
	assert.equal(countPins(database), 0);
	assert.equal(await getPinnedMessage(env, 2), null);
});

test("僅群主可置頂群消息，後臺管理員、普通成員與私信均被拒絕", async () => {
	const { env } = createEnvironment();
	const ownerMeta = {
		room: { id: 2, kind: "private" },
		principal: { userId: 2, isAdmin: false },
	};
	const pinned = await pinRoomMessage(env, ownerMeta, { messageId: 10 });
	assert.deepEqual(JSON.parse(pinned.packet), {
		protocolVersion: 1,
		type: "message_pinned",
		message: pinned.message,
	});

	await assert.rejects(() => pinRoomMessage(
		env,
		{ room: { id: 2, kind: "private" }, principal: { userId: 1, isAdmin: true } },
		{ messageId: 11 },
	), MessagePinningError);

	await assert.rejects(
		pinRoomMessage(
			env,
			{ room: { id: 2, kind: "private" }, principal: { userId: 3, isAdmin: false } },
			{ messageId: 10 },
		),
		(error) => error instanceof MessagePinningError && error.message === "無權管理置頂消息",
	);
	await assert.rejects(
		pinRoomMessage(
			env,
			{ room: { id: 3, kind: "dm" }, principal: { userId: 1, isAdmin: true } },
			{ messageId: 12 },
		),
		(error) => error instanceof MessagePinningError && error.message === "無權管理置頂消息",
	);
});

test("取消置頂只作用於客戶端看到的當前置頂消息", async () => {
	const { env } = createEnvironment();
	const meta = {
		room: { id: 2, kind: "private" },
		principal: { userId: 2, isAdmin: false },
	};
	await pinRoomMessage(env, meta, { messageId: 10 });
	await pinRoomMessage(env, meta, { messageId: 11 });

	await assert.rejects(
		unpinRoomMessage(env, meta, { messageId: 10 }),
		(error) => error instanceof MessagePinningError && error.message === "該消息已不再置頂",
	);
	const unpinned = await unpinRoomMessage(env, meta, { messageId: 11 });
	assert.deepEqual(JSON.parse(unpinned.packet), {
		protocolVersion: 1,
		type: "message_unpinned",
		messageId: 11,
	});
});
