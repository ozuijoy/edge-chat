import api from "./api.js";
import {
	connectRuntimeInboxSocket,
	connectRuntimeRoomSocket,
	isDemoMode,
} from "./runtime.js";

function openSocket(url, { onMessage, onStatus }) {
	const socket = new WebSocket(url);

	socket.addEventListener("open", () => {
		onStatus?.({ status: "open", socket });
	});

	socket.addEventListener("close", (event) => {
		onStatus?.({
			status: "closed",
			socket,
			code: event.code,
			reason: event.reason,
			wasClean: event.wasClean,
		});
	});

	socket.addEventListener("error", () => {
		onStatus?.({ status: "error", socket });
	});

	socket.addEventListener("message", (event) => {
		// transport 只轉交原始 frame；協議解析由 realtime session 統一擁有，避免 room/inbox adapter 漂移。
		onMessage?.(event.data, socket);
	});

	return socket;
}

export function connectRoomSocket({ kind, roomId, onMessage, onStatus }) {
	if (isDemoMode) {
		return connectRuntimeRoomSocket({ kind, roomId, onMessage, onStatus });
	}
	return openSocket(api.getRoomWebSocketUrl(kind, roomId), {
		onMessage,
		onStatus,
	});
}

export function connectInboxSocket({ onMessage, onStatus }) {
	if (isDemoMode) {
		return connectRuntimeInboxSocket({ onMessage, onStatus });
	}
	return openSocket(api.getInboxWebSocketUrl(), { onMessage, onStatus });
}
