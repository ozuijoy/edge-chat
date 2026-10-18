import { ref } from "vue";
import { t } from "../i18n.js";
import { messageMarkdownToPlainText } from "../message-markdown.ts";

export type NotificationRoom = {
	id: number | string;
	kind: string;
	name?: string;
};

export type InAppNotificationEvent = {
	room: NotificationRoom;
	sender?: {
		displayName?: string;
		username?: string;
		avatarUrl?: string;
	};
	contentPreview?: string;
	mentionsMe?: boolean;
	replyToMe?: boolean;
};

export type InAppNotification = {
	id: number;
	room: NotificationRoom;
	senderName: string;
	senderAvatarUrl: string;
	roomName: string;
	preview: string;
	mentionsMe: boolean;
	replyToMe: boolean;
};

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

export function useInAppNotifications(options: {
	durationMs?: number;
	maxVisible?: number;
	translate?: typeof t;
	setTimer?: typeof globalThis.setTimeout;
	clearTimer?: typeof globalThis.clearTimeout;
} = {}) {
	const durationMs = options.durationMs ?? 5_000;
	const maxVisible = options.maxVisible ?? 3;
	const translate = options.translate ?? t;
	const setTimer = options.setTimer ?? globalThis.setTimeout;
	const clearTimer = options.clearTimer ?? globalThis.clearTimeout;
	const notifications = ref<InAppNotification[]>([]);
	const timers = new Map<number, TimerHandle>();
	let nextId = 1;

	function dismissNotification(id: number) {
		const timer = timers.get(id);
		if (timer !== undefined) clearTimer(timer);
		timers.delete(id);
		notifications.value = notifications.value.filter((item) => item.id !== id);
	}

	function showNotification(event: InAppNotificationEvent) {
		const id = nextId++;
		const senderName = event.sender?.displayName || event.sender?.username || "EdgeChat";
		const roomName = event.room.name || "EdgeChat";
			const preview =
				messageMarkdownToPlainText(event.contentPreview || "") ||
			(event.room.kind === "dm"
				? translate("notifications.directMessage")
				: translate("notifications.groupMessage"));
		const notification: InAppNotification = {
			id,
			room: event.room,
			senderName,
			senderAvatarUrl: event.sender?.avatarUrl || "",
			roomName,
			preview,
			mentionsMe: Boolean(event.mentionsMe),
			replyToMe: Boolean(event.replyToMe),
		};

		notifications.value = [...notifications.value, notification];
		while (notifications.value.length > maxVisible) {
			dismissNotification(notifications.value[0].id);
		}
		timers.set(id, setTimer(() => dismissNotification(id), durationMs));
		return id;
	}

	function clearNotifications() {
		for (const timer of timers.values()) clearTimer(timer);
		timers.clear();
		notifications.value = [];
	}

	return {
		inAppNotifications: notifications,
		showInAppNotification: showNotification,
		dismissInAppNotification: dismissNotification,
		clearInAppNotifications: clearNotifications,
	};
}
