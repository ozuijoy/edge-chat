import { computed, ref } from "vue";
import { getNativeNotificationBridge } from "../capacitor-platform.ts";
import { t } from "../i18n.js";
import { messageMarkdownToPlainText } from "../message-markdown.ts";

const STORAGE_KEY_PREFIX = "edgechat:browser-notifications";

export function browserNotificationRoomKey(room) {
	return room ? `${room.kind}:${Number(room.id)}` : "";
}

function loadPreferences(storage, storageKey) {
	const raw = storage?.getItem(storageKey);
	if (!raw) {
		return { enabled: false, mutedRooms: [] };
	}

	try {
		const value = JSON.parse(raw);
		return {
			enabled: value.enabled === true,
			mutedRooms: Array.isArray(value.mutedRooms) ? value.mutedRooms : [],
		};
	} catch {
		return { enabled: false, mutedRooms: [] };
	}
}

export function useBrowserNotifications(options = {}) {
	const browserWindow =
		options.browserWindow === undefined
			? globalThis.window
			: options.browserWindow;
	const notificationApi =
		options.notificationApi === undefined
			? browserWindow?.Notification
			: options.notificationApi;
	const storage =
		options.storage === undefined
			? browserWindow?.localStorage
			: options.storage;
	const nativeNotifications =
		options.nativeNotifications === undefined
			? getNativeNotificationBridge()
			: options.nativeNotifications;
	const storageKey = `${STORAGE_KEY_PREFIX}:${options.userId || "guest"}`;
	const savedPreferences = loadPreferences(storage, storageKey);
	const supported = computed(
		() => Boolean(nativeNotifications) || typeof notificationApi === "function",
	);
	const permission = ref(
		nativeNotifications
			? "prompt"
			: supported.value
				? notificationApi.permission
				: "unsupported",
	);
	const enabled = ref(
		savedPreferences.enabled &&
			(Boolean(nativeNotifications) || permission.value === "granted"),
	);
	const mutedRoomKeys = ref(new Set(savedPreferences.mutedRooms));

	function persistPreferences() {
		storage?.setItem(
			storageKey,
			JSON.stringify({
				enabled: enabled.value,
				mutedRooms: [...mutedRoomKeys.value],
			}),
		);
	}

	function syncPermission() {
		if (nativeNotifications) {
			return nativeNotifications.checkPermission().then((state) => {
				permission.value = state;
				// 僅在權限被明確拒絕時關閉開關；pending/prompt 狀態不關閉，
				// 避免在權限讀取時序問題或待決狀態下誤關用戶的開關。
				if (state === "denied" && enabled.value) {
					enabled.value = false;
					persistPreferences();
				}
				return state;
			});
		}

		permission.value = supported.value
			? notificationApi.permission
			: "unsupported";
		// 同上：只在 denied 時關閉，default/prompt 不關閉。
		if (permission.value === "denied" && enabled.value) {
			enabled.value = false;
			persistPreferences();
		}
		return Promise.resolve(permission.value);
	}

	const notificationStateLabel = computed(() => {
		if (!supported.value) return t("notifications.unavailable");
		if (permission.value === "denied")
			return t("notifications.permissionDenied");
		return enabled.value ? t("notifications.on") : t("notifications.off");
	});

	const notificationActionLabel = computed(() => {
		if (!supported.value) return t("notifications.unsupported");
		if (permission.value === "denied") return t("notifications.blocked");
		return enabled.value
			? t("notifications.disable")
			: t("notifications.enable");
	});

	const notificationToggleDisabled = computed(
		() => !supported.value || permission.value === "denied",
	);

	async function toggleNotifications() {
		await syncPermission();
		if (notificationToggleDisabled.value) {
			return notificationActionLabel.value;
		}

		if (enabled.value) {
			enabled.value = false;
			persistPreferences();
			return notificationActionLabel.value;
		}

		if (nativeNotifications) {
			permission.value = await nativeNotifications.requestPermission();
		} else if (permission.value === "default") {
			permission.value = await notificationApi.requestPermission();
		}
		enabled.value = permission.value === "granted";
		persistPreferences();
		return notificationActionLabel.value;
	}

	function isRoomMuted(room) {
		return mutedRoomKeys.value.has(browserNotificationRoomKey(room));
	}

	function toggleRoomMuted(room) {
		const key = browserNotificationRoomKey(room);
		if (!key) return false;

		const nextMutedRooms = new Set(mutedRoomKeys.value);
		if (nextMutedRooms.has(key)) {
			nextMutedRooms.delete(key);
		} else {
			nextMutedRooms.add(key);
		}
		mutedRoomKeys.value = nextMutedRooms;
		persistPreferences();
		return nextMutedRooms.has(key);
	}

	function shouldNotifyRoom(event) {
		const room = event?.room || event;
		const needsAttention = Boolean(event?.mentionsMe || event?.replyToMe);
		return !isRoomMuted(room) || needsAttention;
	}

	function notifyRoom(event) {
		const room = event?.room || event;
		const needsAttention = Boolean(event?.mentionsMe || event?.replyToMe);
		void syncPermission();
		if (!enabled.value || !shouldNotifyRoom(event)) {
			return false;
		}

		const callInvite = event?.type === 'call_invite';
		const title = callInvite ? `${room.name || 'EdgeChat'} · ${t('call.incoming')}` : event?.replyToMe
			? t("notifications.repliedTitle", { room: room.name || "EdgeChat" })
			: event?.mentionsMe
				? t("notifications.mentionedTitle", { room: room.name || "EdgeChat" })
				: room.name || "EdgeChat";
		const senderName =
			event?.sender?.displayName || event?.sender?.username || "";
			const attentionBody = [
				senderName,
				messageMarkdownToPlainText(event?.contentPreview || ""),
			]
			.filter(Boolean)
			.join(": ");
		const body = callInvite ? t('call.voice') : needsAttention
			? attentionBody ||
				(event?.replyToMe
					? t("notifications.repliedBody")
					: t("notifications.mentionedBody"))
			: room.kind === "dm"
				? t("notifications.directMessage")
				: t("notifications.groupMessage");

		if (nativeNotifications) {
			void nativeNotifications.showNotification({
				title,
				body,
				tag: `edgechat:${browserNotificationRoomKey(room)}`,
				roomKind: room.kind,
				roomId: Number(room.id),
			});
			return true;
		}

		const tag = `edgechat:${browserNotificationRoomKey(room)}`;

		// PWA / standalone 模式下，Service Worker 的 showNotification 比
		// Notification 構造函數更可靠（構造函數在部分 Chrome 獨立窗口中
		// 不會顯示）。優先走 SW，失敗或無 SW 時回退到構造函數。
		const swContainer = browserWindow?.navigator?.serviceWorker;
		if (typeof swContainer?.getRegistration === "function") {
			// ready 在註冊失敗時可能永遠不完成，不能讓通知一直等待它。
			void swContainer.getRegistration()
				.then((registration) => {
					if (
						!registration?.active ||
						new URL(registration.active.scriptURL).pathname !== "/sw.js"
					) {
						showFallbackNotification(title, body, tag, room);
						return;
					}
					return registration.showNotification(title, {
						body,
						tag,
						renotify: true,
						data: {
							roomKind: room.kind,
							roomId: Number(room.id),
						},
					});
				})
				.catch(() => {
					showFallbackNotification(title, body, tag, room);
				});
			return true;
		}

		showFallbackNotification(title, body, tag, room);
		return true;
	}

	function showFallbackNotification(title, body, tag, room) {
		if (typeof notificationApi !== "function") {
			return;
		}
		const notification = new notificationApi(title, {
			body,
			tag,
			renotify: true,
		});
		notification.onclick = () => {
			browserWindow?.focus();
			options.onOpenRoom?.(room);
			notification.close();
		};
	}

	return {
		notificationsEnabled: enabled,
		notificationPermission: permission,
		notificationStateLabel,
		notificationActionLabel,
		notificationToggleDisabled,
		syncNotificationPermission: syncPermission,
		toggleNotifications,
		isRoomMuted,
		toggleRoomMuted,
		shouldNotifyRoom,
		notifyRoom,
	};
}
