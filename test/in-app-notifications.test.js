import assert from "node:assert/strict";
import test from "node:test";

import { useInAppNotifications } from "../frontend/src/composables/useInAppNotifications.ts";

function createTimerHarness() {
	const callbacks = new Map();
	let nextTimer = 1;
	return {
		callbacks,
		setTimer(callback) {
			const id = nextTimer++;
			callbacks.set(id, callback);
			return id;
		},
		clearTimer(id) {
			callbacks.delete(id);
		},
	};
}

function createEvent(overrides = {}) {
	return {
		room: { kind: "private", id: 3, name: "產品協作" },
		sender: {
			displayName: "Alice",
			username: "alice",
			avatarUrl: "/files/avatar.png",
		},
		contentPreview: "請查看最新的設計稿",
		...overrides,
	};
}

test("應用內通知保留頭像、暱稱、會話與消息預覽", () => {
	const timers = createTimerHarness();
	const notifications = useInAppNotifications({
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
	});

	const id = notifications.showInAppNotification(createEvent({ mentionsMe: true }));
	assert.deepEqual(notifications.inAppNotifications.value, [
		{
			id,
			room: { kind: "private", id: 3, name: "產品協作" },
			senderName: "Alice",
			senderAvatarUrl: "/files/avatar.png",
			roomName: "產品協作",
			preview: "請查看最新的設計稿",
			mentionsMe: true,
			replyToMe: false,
		},
	]);
});

test("空正文使用會話類型提示，通知超時後自動消失", () => {
	const timers = createTimerHarness();
	const notifications = useInAppNotifications({
		translate: (key) => `translated:${key}`,
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
	});

	notifications.showInAppNotification(
		createEvent({ room: { kind: "dm", id: 8, name: "Bob" }, contentPreview: "" }),
	);
	assert.equal(
		notifications.inAppNotifications.value[0].preview,
		"translated:notifications.directMessage",
	);
	const [timer] = timers.callbacks.values();
	timer();
	assert.deepEqual(notifications.inAppNotifications.value, []);
});

test("應用內通知隊列只保留最新三條並支持統一清理", () => {
	const timers = createTimerHarness();
	const notifications = useInAppNotifications({
		maxVisible: 3,
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
	});

	for (let id = 1; id <= 4; id += 1) {
		notifications.showInAppNotification(createEvent({ room: { kind: "private", id, name: `群組 ${id}` } }));
	}
	assert.deepEqual(
		notifications.inAppNotifications.value.map((item) => item.room.id),
		[2, 3, 4],
	);
	assert.equal(timers.callbacks.size, 3);

	notifications.clearInAppNotifications();
	assert.deepEqual(notifications.inAppNotifications.value, []);
	assert.equal(timers.callbacks.size, 0);
});
