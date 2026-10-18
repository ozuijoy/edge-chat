import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import initSqlJs from "sql.js";
import { isGroupChannelKind } from "../shared/group-channel.ts";
import {
	createTelegramMapping,
	getTelegramMappingByChatId,
	listEnabledTelegramMappingsForChannel,
	listTelegramBridgeAdminState,
} from "../worker/src/data/telegram.js";
import { createD1Adapter } from "./support/d1.js";

const SQL = await initSqlJs();
const schema = readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8");

function createTelegramDatabase() {
	const database = new SQL.Database();
	database.exec(schema);
	database.run(
		"INSERT INTO users (username, display_name, password_hash, password_salt, is_super_admin) VALUES (?, ?, ?, ?, 1)",
		["admin", "Admin", "hash", "salt"],
	);
	database.run(
		"INSERT INTO channels (name, kind, created_by) VALUES (?, 'private', 1), (?, 'dm', 1)",
		["Private bridge", "Direct message"],
	);
	return createD1Adapter(database);
}

test("Telegram 后台列出公开与私有群，但不把私信当作群聊", async () => {
	const DB = createTelegramDatabase();
	const state = await listTelegramBridgeAdminState({ DB });

	assert.deepEqual(
		state.channels.map(({ name, kind }) => ({ name, kind })),
		[
			{ name: "general", kind: "public" },
			{ name: "Private bridge", kind: "private" },
		],
	);
	assert.equal(isGroupChannelKind("public"), true);
	assert.equal(isGroupChannelKind("private"), true);
	assert.equal(isGroupChannelKind("dm"), false);
});

test("Telegram 私有群映射可供双向桥接查询，私信映射继续拒绝", async () => {
	const DB = createTelegramDatabase();
	const mappingId = await createTelegramMapping(DB, {
		channelId: 2,
		telegramChatId: "-100200",
		telegramChatTitle: "Private Telegram group",
		createdBy: 1,
	});

	assert.equal(Number.isInteger(mappingId), true);
	const inboundMapping = await getTelegramMappingByChatId(DB, "-100200");
	assert.deepEqual(
		{
			id: inboundMapping.id,
			channelId: inboundMapping.channelId,
			channelName: inboundMapping.channelName,
			channelKind: inboundMapping.channelKind,
			telegramChatId: inboundMapping.telegramChatId,
			telegramChatTitle: inboundMapping.telegramChatTitle,
			enabled: inboundMapping.enabled,
		},
		{
			id: mappingId,
			channelId: 2,
			channelName: "Private bridge",
			channelKind: "private",
			telegramChatId: "-100200",
			telegramChatTitle: "Private Telegram group",
			enabled: true,
		},
	);
	const outboundMappings = await listEnabledTelegramMappingsForChannel(DB, 2);
	assert.equal(outboundMappings.length, 1);
	assert.equal(outboundMappings[0].channelKind, "private");
	assert.equal(
		await createTelegramMapping(DB, {
			channelId: 3,
			telegramChatId: "-100300",
			telegramChatTitle: "DM must stay local",
			createdBy: 1,
		}),
		null,
	);
});
