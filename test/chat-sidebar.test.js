import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { useChatSidebar } from "../frontend/src/composables/useChatSidebar.js";
import { CHINESE_LOCALE, setLocale } from "../frontend/src/i18n.js";

beforeEach(async () => {
	await setLocale(CHINESE_LOCALE);
});

test("general 在私信和其他群组之前永久置顶", () => {
	const sidebar = useChatSidebar({
		applyActiveChannel() {},
		selectDm() {},
	});
	const newer = "2026-07-28T12:00:00.000Z";
	const older = "2026-07-01T12:00:00.000Z";

	sidebar.channels.value = [
		{
			id: 1,
			name: "general",
			kind: "public",
			isGeneral: true,
			isMember: true,
			lastMessageAt: older,
		},
		{
			id: 2,
			name: "Team",
			kind: "private",
			isGeneral: false,
			isMember: true,
			lastMessageAt: newer,
		},
		{
			id: 4,
			name: "公开讨论",
			kind: "public",
			isGeneral: false,
			isMember: false,
			memberCount: 3,
			lastMessageAt: newer,
		},
	];
	sidebar.dms.value = [
		{
			id: 3,
			kind: "dm",
			otherUser: { username: "alice", displayName: "Alice", avatarUrl: "" },
			lastMessageAt: newer,
		},
	];

	assert.deepEqual(
		sidebar.conversationItems.value.map((item) => item.key),
		["public:1", "dm:3", "private:2"],
	);
	assert.equal(sidebar.conversationItems.value[0].subtitle, "全员群组");
	assert.deepEqual(
		sidebar.publicGroupItems.value.map((item) => item.key),
		["public:4"],
	);
	assert.equal(sidebar.publicGroupItems.value[0].subtitle, "3 位成员");
	sidebar.channels.value[1].unreadCount = 4;
	sidebar.channels.value[1].mentionUnreadCount = 2;
	assert.equal(sidebar.conversationItems.value.find((item) => item.id === 2).mentionUnreadCount, 2);
	sidebar.markConversationRead("private", 2);
	assert.equal(sidebar.channels.value[1].unreadCount, 0);
	assert.equal(sidebar.channels.value[1].mentionUnreadCount, 0);
});

test("未加入公开群确认加入后才进入普通会话列表", async () => {
	const calls = [];
	const sidebar = useChatSidebar({
		applyActiveChannel() {},
		selectDm() {},
		sidebarApi: {
			async joinChannel(channelId) {
				calls.push(["joinChannel", channelId]);
			},
			async markRoomRead() {},
			async bootstrap() {
				return { channels: [], dms: [], users: [] };
			},
		},
	});
	const channel = {
		id: 8,
		name: "开发交流",
		kind: "public",
		isGeneral: false,
		isMember: false,
		memberCount: 5,
	};
	sidebar.channels.value = [channel];

	assert.equal(sidebar.conversationItems.value.length, 0);
	assert.equal(sidebar.publicGroupItems.value.length, 1);
	await sidebar.joinPublicChannel(channel);

	assert.deepEqual(calls, [["joinChannel", 8]]);
	assert.equal(channel.isMember, true);
	assert.equal(channel.myRole, "member");
	assert.equal(channel.memberCount, 6);
	assert.equal(sidebar.publicGroupItems.value.length, 0);
	assert.deepEqual(
		sidebar.conversationItems.value.map((item) => item.key),
		["public:8"],
	);
});
