import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import { useUnreadInbox } from "../frontend/src/composables/useUnreadInbox.js";

function createInboxHarness({ activeRoom, pageActive }) {
	const activity = [];
	const read = [];
	const apiRead = [];
	const inAppNotifications = [];
	const systemNotifications = [];
	let handlers;
	const socket = {
		readyState: 1,
		close() {
			this.readyState = 3;
		},
	};
	const inbox = useUnreadInbox({
		activeRoom,
		applyConversationActivity(payload) {
			activity.push(payload);
		},
		markConversationRead(kind, roomId) {
			read.push({ kind, roomId });
		},
		roomApi: {
			async markRoomRead(kind, roomId, messageId) {
				apiRead.push({ kind, roomId, messageId });
			},
		},
		openInboxConnection(connectionHandlers) {
			handlers = connectionHandlers;
			connectionHandlers.onStatus({ status: "open", socket });
			return socket;
		},
		notifyInApp(room) {
			inAppNotifications.push(room);
		},
		notifySystem(room) {
			systemNotifications.push(room);
		},
		isPageActive: () => pageActive,
	});
	inbox.connectUnreadInbox();
	return {
		activity,
		read,
		apiRead,
		inAppNotifications,
		systemNotifications,
		emit(payload) {
			handlers.onMessage(JSON.stringify(payload), socket);
		},
	};
}

const messagePayload = {
	type: "room_message",
	room: { kind: "private", id: 2, name: "产品协作" },
	messageId: 18,
	createdAt: "2026-08-16T10:00:00.000Z",
	unreadCount: 3,
	mentionUnreadCount: 1,
	mentionsMe: true,
};

test("前台当前会话的普通消息直接标记已读且不提示", () => {
	const harness = createInboxHarness({
		activeRoom: ref({ kind: "private", id: "2" }),
		pageActive: true,
	});
	harness.emit({ ...messagePayload, mentionsMe: false, mentionUnreadCount: 0 });

	assert.deepEqual(harness.read, [{ kind: "private", roomId: 2 }]);
	assert.deepEqual(harness.apiRead, [
		{ kind: "private", roomId: 2, messageId: 18 },
	]);
	assert.deepEqual(harness.activity, []);
	assert.deepEqual(harness.inAppNotifications, []);
	assert.deepEqual(harness.systemNotifications, []);
});

test("前台当前会话的提及和回复仍显示应用内通知", () => {
	const harness = createInboxHarness({
		activeRoom: ref({ kind: "private", id: 2 }),
		pageActive: true,
	});
	harness.emit(messagePayload);
	harness.emit({ ...messagePayload, mentionsMe: false, replyToMe: true });

	assert.equal(harness.read.length, 2);
	assert.deepEqual(harness.inAppNotifications, [
		messagePayload,
		{ ...messagePayload, mentionsMe: false, replyToMe: true },
	]);
	assert.deepEqual(harness.systemNotifications, []);
});

test("前台其他会话保留未读并显示应用内通知", () => {
	const harness = createInboxHarness({
		activeRoom: ref({ kind: "dm", id: 9 }),
		pageActive: true,
	});
	harness.emit(messagePayload);

	assert.equal(harness.activity[0].unreadCount, 3);
	assert.equal(harness.activity[0].mentionUnreadCount, 1);
	assert.deepEqual(harness.inAppNotifications, [messagePayload]);
	assert.deepEqual(harness.systemNotifications, []);
	assert.deepEqual(harness.read, []);
});

test("通讯录隐藏原会话后只累计未读而不提交已读", () => {
	const activeRoom = ref({ kind: "private", id: 2 });
	const harness = createInboxHarness({ activeRoom, pageActive: true });
	activeRoom.value = null;
	harness.emit({ ...messagePayload, mentionsMe: false, mentionUnreadCount: 0 });

	assert.equal(harness.activity[0].unreadCount, 3);
	assert.deepEqual(harness.read, []);
	assert.deepEqual(harness.apiRead, []);
	assert.deepEqual(harness.inAppNotifications, [
		{ ...messagePayload, mentionsMe: false, mentionUnreadCount: 0 },
	]);
});

test("页面失焦时保留未读并只触发系统通知", () => {
	const hiddenActiveRoom = createInboxHarness({
		activeRoom: ref({ kind: "private", id: 2 }),
		pageActive: false,
	});
	hiddenActiveRoom.emit(messagePayload);
	assert.equal(hiddenActiveRoom.activity.length, 1);
	assert.deepEqual(hiddenActiveRoom.systemNotifications, [messagePayload]);
	assert.deepEqual(hiddenActiveRoom.inAppNotifications, []);
	assert.deepEqual(hiddenActiveRoom.read, []);
});
