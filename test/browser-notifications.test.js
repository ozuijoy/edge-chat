import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import {
	browserNotificationRoomKey,
	useBrowserNotifications,
} from "../frontend/src/composables/useBrowserNotifications.js";
import { CHINESE_LOCALE, setLocale } from "../frontend/src/i18n.js";

beforeEach(async () => {
	await setLocale(CHINESE_LOCALE);
});

function createStorage() {
	const values = new Map();
	return {
		getItem(key) {
			return values.get(key) ?? null;
		},
		setItem(key, value) {
			values.set(key, value);
		},
	};
}

function createNotificationApi() {
	const notifications = [];
	class FakeNotification {
		static permission = "default";

		static async requestPermission() {
			FakeNotification.permission = "granted";
			return FakeNotification.permission;
		}

		constructor(title, options) {
			this.title = title;
			this.options = options;
			this.closed = false;
			notifications.push(this);
		}

		close() {
			this.closed = true;
		}
	}
	return { NotificationApi: FakeNotification, notifications };
}

test("浏览器通知需由用户授权开启，并按账号持久化", async () => {
	const storage = createStorage();
	const { NotificationApi } = createNotificationApi();
	const notifications = useBrowserNotifications({
		userId: 7,
		notificationApi: NotificationApi,
		storage,
		browserWindow: {},
	});

	assert.equal(notifications.notificationsEnabled.value, false);
	assert.equal(notifications.notificationActionLabel.value, "开启通知");
	await notifications.toggleNotifications();
	assert.equal(notifications.notificationsEnabled.value, true);
	assert.match(storage.getItem("edgechat:browser-notifications:7"), /"enabled":true/);

	const restored = useBrowserNotifications({
		userId: 7,
		notificationApi: NotificationApi,
		storage,
		browserWindow: {},
	});
	assert.equal(restored.notificationsEnabled.value, true);
	const otherAccount = useBrowserNotifications({
		userId: 8,
		notificationApi: NotificationApi,
		storage,
		browserWindow: {},
	});
	assert.equal(otherAccount.notificationsEnabled.value, false);

	NotificationApi.permission = "denied";
	restored.syncNotificationPermission();
	assert.equal(restored.notificationsEnabled.value, false);
	assert.equal(restored.notificationActionLabel.value, "浏览器已阻止通知");
});

test("会话免打扰阻止通知，取消后通知可聚合并打开会话", async () => {
	const storage = createStorage();
	const { NotificationApi, notifications: shown } = createNotificationApi();
	let focused = 0;
	let openedRoom = null;
	const browserWindow = { focus: () => focused++ };
	const notifications = useBrowserNotifications({
		userId: 9,
		notificationApi: NotificationApi,
		storage,
		browserWindow,
		onOpenRoom(room) {
			openedRoom = room;
		},
	});
	const room = { kind: "dm", id: "12", name: "Alice" };

	await notifications.toggleNotifications();
	assert.equal(browserNotificationRoomKey(room), "dm:12");
	notifications.toggleRoomMuted(room);
	assert.equal(notifications.isRoomMuted(room), true);
	assert.equal(notifications.notifyRoom(room), false);

	notifications.toggleRoomMuted(room);
	assert.equal(notifications.notifyRoom(room), true);
	assert.equal(shown.length, 1);
	assert.equal(shown[0].title, "Alice");
	assert.deepEqual(shown[0].options, {
		body: "收到一条新私信",
		tag: "edgechat:dm:12",
		renotify: true,
	});
	shown[0].onclick();
	assert.equal(focused, 1);
	assert.equal(openedRoom, room);
	assert.equal(shown[0].closed, true);

	NotificationApi.permission = "granted";
	const groupRoom = { kind: "public", id: 3, name: "产品协作" };
	assert.equal(notifications.notifyRoom(groupRoom), true);
	assert.equal(shown[1].options.body, "收到一条新群聊消息");

	const mentionEvent = {
		room: groupRoom,
		mentionsMe: true,
		contentPreview: "@admin 请看一下",
		sender: { displayName: "Alice" },
	};
	assert.equal(notifications.notifyRoom(mentionEvent), true);
	assert.equal(shown[2].title, "有人在 产品协作 提及你");
	assert.equal(shown[2].options.body, "Alice: @admin 请看一下");
	notifications.toggleRoomMuted(groupRoom);
	assert.equal(notifications.shouldNotifyRoom(groupRoom), false);
	assert.equal(notifications.shouldNotifyRoom(mentionEvent), true);
	assert.equal(notifications.notifyRoom(mentionEvent), true);
	assert.equal(shown.length, 4);

	const replyEvent = {
		room: groupRoom,
		replyToMe: true,
		contentPreview: "已经处理好了",
		sender: { displayName: "Bob" },
	};
	assert.equal(notifications.shouldNotifyRoom(replyEvent), true);
	assert.equal(notifications.notifyRoom(replyEvent), true);
	assert.equal(shown[4].title, "有人在 产品协作 回复你");
	assert.equal(shown[4].options.body, "Bob: 已经处理好了");
});

test("浏览器拒绝通知权限时开关保持禁用", async () => {
	const { NotificationApi } = createNotificationApi();
	NotificationApi.permission = "denied";
	const notifications = useBrowserNotifications({
		notificationApi: NotificationApi,
		storage: createStorage(),
		browserWindow: {},
	});

	assert.equal(notifications.notificationToggleDisabled.value, true);
	assert.equal(notifications.notificationActionLabel.value, "浏览器已阻止通知");
	await notifications.toggleNotifications();
	assert.equal(notifications.notificationsEnabled.value, false);
});

test("Service Worker 未激活或注册查询失败时使用原有通知", async () => {
	const { NotificationApi, notifications: shown } = createNotificationApi();
	NotificationApi.permission = "granted";
	let registration = null;
	let registrationLookupFails = false;
	const browserWindow = {
		navigator: {
			serviceWorker: {
				ready: new Promise(() => {}),
				async getRegistration() {
					if (registrationLookupFails) throw new Error("registration unavailable");
					return registration;
				},
			},
		},
	};
	const notifications = useBrowserNotifications({
		userId: 11,
		browserWindow,
		notificationApi: NotificationApi,
		storage: createStorage(),
	});
	await notifications.toggleNotifications();
	assert.equal(notifications.notifyRoom({ kind: "dm", id: 5, name: "Alice" }), true);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(shown.length, 1);

	registration = { active: { scriptURL: "https://chat.example/sw.js" },
		async showNotification() { throw new Error("notifications unavailable"); } };
	assert.equal(notifications.notifyRoom({ kind: "dm", id: 6, name: "Bob" }), true);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(shown.length, 2);
	assert.equal(shown[1].title, "Bob");

	registrationLookupFails = true;
	assert.equal(notifications.notifyRoom({ kind: "dm", id: 7, name: "Carol" }), true);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(shown.length, 3);

	registrationLookupFails = false;
	const swShown = [];
	registration.showNotification = async (title, options) => swShown.push({ title, options });
	assert.equal(notifications.notifyRoom({ kind: "dm", id: 8, name: "Dave" }), true);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(shown.length, 3);
	assert.equal(swShown[0].title, "Dave");
	assert.deepEqual(swShown[0].options.data, { roomKind: "dm", roomId: 8 });
});

test("Capacitor 通知复用会话偏好并交给原生插件展示", async () => {
	const shown = [];
	const nativeNotifications = {
		async checkPermission() {
			return "prompt";
		},
		async requestPermission() {
			return "granted";
		},
		async showNotification(payload) {
			shown.push(payload);
			return { shown: true };
		},
	};
	const notifications = useBrowserNotifications({
		userId: 10,
		browserWindow: {},
		storage: createStorage(),
		nativeNotifications,
	});

	await notifications.toggleNotifications();
	assert.equal(notifications.notificationsEnabled.value, true);
	assert.equal(
		notifications.notifyRoom({
			room: { kind: "private", id: 6, name: "项目组" },
			contentPreview: "构建完成",
			sender: { displayName: "Alice" },
		}),
		true,
	);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.deepEqual(shown, [
		{
			title: "项目组",
			body: "收到一条新群聊消息",
			tag: "edgechat:private:6",
			roomKind: "private",
			roomId: 6,
		},
	]);
});
