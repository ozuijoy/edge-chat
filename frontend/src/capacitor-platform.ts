import { Capacitor, registerPlugin } from "@capacitor/core";

type NotificationPermissionState = "granted" | "denied" | "prompt";

type NativeFileResult = {
	cancelled?: boolean;
	name?: string;
	type?: string;
	uri?: string;
};

export type NativeRoomTarget = {
	kind: string;
	id: number;
};

type NativeNotification = {
	title: string;
	body: string;
	tag: string;
	roomKind?: string;
	roomId?: number;
};

interface EdgeChatNativePlugin {
	requestMicrophonePermission(): Promise<{
		state: "granted" | "denied" | "prompt" | "prompt-with-rationale";
	}>;
	openAppSettings(): Promise<void>;
	pickFile(options: { accept: string }): Promise<NativeFileResult>;
	checkNotificationPermission(): Promise<{
		state: NotificationPermissionState;
	}>;
	requestNotificationPermission(): Promise<{
		state: NotificationPermissionState;
	}>;
	showNotification(
		notification: NativeNotification,
	): Promise<{ shown: boolean }>;
	openExternal(options: { url: string }): Promise<void>;
	addListener(
		eventName: "notificationOpened",
		listener: (target: NativeRoomTarget) => void,
	): Promise<{ remove: () => Promise<void> }>;
}

const NATIVE_SERVER_STORAGE_KEY = "edgechat.nativeServerOrigin";
const MAX_NATIVE_FILE_BYTES = 20 * 1024 * 1024;
const EdgeChatNative = registerPlugin<EdgeChatNativePlugin>("EdgeChatNative");

export const isCapacitorAndroid =
	Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
export const NATIVE_ROOM_OPEN_EVENT = "edgechat:native-room-open";
let pendingNativeRoomTarget: NativeRoomTarget | null = null;

export async function requestNativeMicrophonePermission() {
	if (!isCapacitorAndroid) return;
	const { state } = await EdgeChatNative.requestMicrophonePermission();
	if (state !== "granted") throw new Error("native_microphone_permission_denied");
}

export async function openNativeAppSettings() {
	if (isCapacitorAndroid) await EdgeChatNative.openAppSettings();
}

export function queueNativeRoomTarget(target: NativeRoomTarget) {
	pendingNativeRoomTarget = target;
	globalThis.window?.dispatchEvent(new CustomEvent(NATIVE_ROOM_OPEN_EVENT));
}

export function consumeNativeRoomTarget() {
	const target = pendingNativeRoomTarget;
	pendingNativeRoomTarget = null;
	return target;
}

export function resolveConfiguredServerOrigin(configuredOrigin: string) {
	let url: URL;
	try {
		url = new URL(String(configuredOrigin || "").trim());
	} catch {
		throw new Error("native_server_https_required");
	}
	if (url.protocol !== "https:") {
		throw new Error("native_server_https_required");
	}
	return url.origin;
}

export function getStoredNativeServerOrigin() {
	if (!isCapacitorAndroid) {
		return "";
	}
	return globalThis.localStorage?.getItem(NATIVE_SERVER_STORAGE_KEY) || "";
}

export function setStoredNativeServerOrigin(configuredOrigin: string) {
	const origin = resolveConfiguredServerOrigin(configuredOrigin);
	globalThis.localStorage?.setItem(NATIVE_SERVER_STORAGE_KEY, origin);
	return origin;
}

export function restoreStoredNativeServerOrigin(origin: string) {
	if (origin) {
		globalThis.localStorage?.setItem(NATIVE_SERVER_STORAGE_KEY, origin);
	} else {
		globalThis.localStorage?.removeItem(NATIVE_SERVER_STORAGE_KEY);
	}
}

export function getEdgeChatServerOrigin() {
	if (isCapacitorAndroid) {
		const storedOrigin = getStoredNativeServerOrigin();
		if (!storedOrigin) {
			throw new Error("native_server_not_configured");
		}
		return storedOrigin;
	}
	return globalThis.location?.origin || "";
}

export function resolveServerUrl(path: string) {
	if (!isCapacitorAndroid) {
		return path;
	}
	return new URL(path, `${getEdgeChatServerOrigin()}/`).toString();
}

export function resolveServerAssetUrl(value: string) {
	const raw = String(value || "");
	return isCapacitorAndroid && raw.startsWith("/")
		? resolveServerUrl(raw)
		: raw;
}

export async function pickNativeFile(accept = "*/*") {
	if (!isCapacitorAndroid) {
		return null;
	}

	const result = await EdgeChatNative.pickFile({ accept });
	if (result.cancelled || !result.uri || !result.name) {
		return null;
	}

	const response = await fetch(Capacitor.convertFileSrc(result.uri));
	const blob = await response.blob();
	if (blob.size > MAX_NATIVE_FILE_BYTES) {
		throw new Error("file_too_large");
	}
	return new File([blob], result.name, {
		type: result.type || blob.type || "application/octet-stream",
	});
}

export function getNativeNotificationBridge() {
	if (!isCapacitorAndroid) {
		return null;
	}

	return {
		async checkPermission() {
			return (await EdgeChatNative.checkNotificationPermission()).state;
		},
		async requestPermission() {
			return (await EdgeChatNative.requestNotificationPermission()).state;
		},
		showNotification(notification: NativeNotification) {
			return EdgeChatNative.showNotification(notification);
		},
	};
}

function isExternalAnchor(anchor: HTMLAnchorElement) {
	return (
		anchor.target === "_blank" &&
		/^(https?:|mailto:|tel:)$/.test(anchor.protocol)
	);
}

export async function installCapacitorIntegration(options: {
	onOpenRoom: (target: NativeRoomTarget) => void;
}) {
	if (!isCapacitorAndroid) {
		return;
	}

	await EdgeChatNative.addListener("notificationOpened", options.onOpenRoom);
	document.addEventListener("click", (event) => {
		const anchor = (event.target as Element | null)?.closest?.("a[href]");
		if (!(anchor instanceof HTMLAnchorElement) || !isExternalAnchor(anchor)) {
			return;
		}

		event.preventDefault();
		void EdgeChatNative.openExternal({ url: anchor.href });
	});
}
