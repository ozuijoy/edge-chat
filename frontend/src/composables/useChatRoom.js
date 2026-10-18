import { nextTick, ref, watch } from "vue";
import api from "../api.js";
import { dispatchAuthInvalid } from "../auth-storage.js";
import { createRealtimeSession } from "../realtime-session.js";
import { connectRoomSocket } from "../ws.js";
import { t } from "../i18n.js";
import { localizeErrorMessage } from "../localized-error.js";
import { useAttachmentQueue } from "./useAttachmentQueue.js";

const WS_CLOSE_UNAUTHORIZED = 4401;
const WS_CLOSE_FORBIDDEN = 4403;
const WS_REASON_UNAUTHORIZED = "session_invalid";
const WS_REASON_FORBIDDEN = "room_forbidden";

export function useChatRoom({
	activeRoom,
	session,
	error,
	roomVisible = { value: true },
	onRoomActivity = () => {},
	onRoomAccessRevoked = () => {},
	roomApi = api,
	openRoomConnection = connectRoomSocket,
}) {
	const messages = ref([]);
	const pinnedMessage = ref(null);
	const highlightedMessageId = ref(null);
	const loading = ref(false);
	const wsStatus = ref("closed");
	const composerText = ref("");
	const {
		pendingAttachments, attachmentsReady, uploadAttachment, retryAttachment,
		clearAttachment, clearAttachments, addReadyAttachment,
	} = useAttachmentQueue((file) => roomApi.uploadFile(file));
	const sending = ref(false);
	const messagesEl = ref(null);
	let messageLoadGeneration = 0;
	let highlightTimer = null;

	function roomKey(room = activeRoom.value) {
		return room?.kind && room?.id ? `${room.kind}:${room.id}` : "";
	}

	function isOwnMessage(message) {
		return (
			message.sender.kind !== "external" &&
			Number(message.sender.id) === Number(session.value?.userId)
		);
	}

	function scrollToBottom() {
		const element = messagesEl.value;
		if (element) {
			requestAnimationFrame(() => {
				element.scrollTop = element.scrollHeight;
			});
		}
	}

	function mergeMessages(...collections) {
		const byId = new Map();
		for (const collection of collections) {
			for (const message of collection || []) {
				byId.set(Number(message.id), message);
			}
		}
		return [...byId.values()].sort((left, right) => Number(left.id) - Number(right.id));
	}

	function highlightMessage(messageId) {
		const numericMessageId = Number(messageId);
		const element = messagesEl.value?.querySelector(
			`[data-message-id="${numericMessageId}"]`,
		);
		if (!element) {
			return false;
		}
		element.scrollIntoView({ behavior: "smooth", block: "center" });
		highlightedMessageId.value = numericMessageId;
		if (highlightTimer !== null) {
			globalThis.clearTimeout(highlightTimer);
		}
		highlightTimer = globalThis.setTimeout(() => {
			highlightedMessageId.value = null;
			highlightTimer = null;
		}, 1400);
		return true;
	}

	function clearMessageHighlight() {
		highlightedMessageId.value = null;
		if (highlightTimer !== null) {
			globalThis.clearTimeout(highlightTimer);
			highlightTimer = null;
		}
	}

	function applyActiveRoomActivity(message) {
		if (!activeRoom.value || !message || !roomVisible.value) {
			return;
		}

		onRoomActivity({ room: activeRoom.value, message });

		if (!isOwnMessage(message)) {
			void roomApi
				.markRoomRead(activeRoom.value.kind, activeRoom.value.id, message.id)
				.catch(() => {});
		}
	}

	function handleRoomAccessRevoked() {
		const room = activeRoom.value;
		if (!room) {
			return;
		}

		disconnectSocket();
		messages.value = [];
		pinnedMessage.value = null;
		clearMessageHighlight();
		onRoomAccessRevoked(room);
	}

	function handleSocketClose(event) {
		const code = Number(event?.code || 0);
		const reason = String(event?.reason || "");
		if (code === WS_CLOSE_UNAUTHORIZED || reason === WS_REASON_UNAUTHORIZED) {
			dispatchAuthInvalid(t('chat.sessionInvalid'));
			return;
		}
		if (code === WS_CLOSE_FORBIDDEN || reason === WS_REASON_FORBIDDEN) {
			handleRoomAccessRevoked();
		}
	}

	const roomSession = createRealtimeSession({
		openConnection(params, handlers) {
			return openRoomConnection({
				kind: params.kind,
				roomId: params.roomId,
				...handlers,
			});
		},
		onStatus(event) {
			wsStatus.value = event.status === "reconnecting" ? "connecting" : event.status;
		},
		onClose: handleSocketClose,
		onMessage(payload, connection) {
			if (connection?.key !== roomKey()) {
				return;
			}
			if (payload.type === "message" && payload.message) {
				if (messages.value.some((item) => item.id === payload.message.id)) {
					return;
				}
				messages.value = [...messages.value, payload.message];
				applyActiveRoomActivity(payload.message);
				nextTick().then(scrollToBottom);
			}
			if (payload.type === "message_deleted") {
				const messageId = Number(payload.messageId);
				messages.value = messages.value
					.filter((message) => Number(message.id) !== messageId)
					.map((message) =>
						Number(message.replyToMessageId) === messageId
							? { ...message, replyTo: { id: messageId, deleted: true } }
							: message,
					);
				if (Number(pinnedMessage.value?.id) === messageId) {
					pinnedMessage.value = null;
				}
			}
			if (payload.type === "message_pinned" && payload.message) {
				pinnedMessage.value = payload.message;
			}
			if (
				payload.type === "message_unpinned" &&
				Number(pinnedMessage.value?.id) === Number(payload.messageId)
			) {
				pinnedMessage.value = null;
			}
			if (payload.type === "error") {
				error.value = localizeErrorMessage(payload.error);
			}
		},
	});

	async function loadMessages(before = null, append = false) {
		const room = activeRoom.value;
		const key = roomKey(room);
		if (!key) {
			return false;
		}

		const generation = ++messageLoadGeneration;
		loading.value = true;
		error.value = "";
		try {
			const payload = await roomApi.getMessages(room.kind, room.id, before);
			if (generation !== messageLoadGeneration || roomKey() !== key) {
				return false;
			}
			messages.value = append
				? mergeMessages(payload.messages, messages.value)
				: payload.messages;
			pinnedMessage.value = payload.pinnedMessage || null;
			await nextTick();
			if (!append) {
				scrollToBottom();
			}
			return true;
		} catch (currentError) {
			if (generation === messageLoadGeneration && roomKey() === key) {
				error.value = currentError.message;
			}
			return false;
		} finally {
			if (generation === messageLoadGeneration) {
				loading.value = false;
			}
		}
	}

	async function activateRoom() {
		messageLoadGeneration += 1;
		messages.value = [];
		pinnedMessage.value = null;
		clearMessageHighlight();
		loading.value = false;
		connectSocket();
		return loadMessages();
	}

	function deactivateRoom() {
		messageLoadGeneration += 1;
		messages.value = [];
		pinnedMessage.value = null;
		clearMessageHighlight();
		loading.value = false;
		disconnectSocket();
	}

	function pauseRoom() {
		// 离开聊天内容时只终止在途读取与实时连接，草稿和现有消息留给返回后的恢复流程。
		messageLoadGeneration += 1;
		loading.value = false;
		disconnectSocket();
	}

	function connectSocket() {
		if (!activeRoom.value) {
			return;
		}
		const key = roomKey();
		roomSession.connect(key, {
			kind: activeRoom.value.kind,
			roomId: activeRoom.value.id,
		});
	}

	function disconnectSocket() {
		roomSession.disconnect();
	}

	async function sendMessage(mentionUserIds = [], replyMessageId = null) {
		const key = roomKey();
		if (!roomSession.isOpenFor(key)) {
			error.value = t('chat.realtimeNotReady');
			return false;
		}
		if (sending.value || !attachmentsReady.value ||
			(!composerText.value.trim() && !pendingAttachments.value.length)) {
			return false;
		}

		sending.value = true;
		error.value = "";
		try {
			const entries = pendingAttachments.value.length ? [...pendingAttachments.value] : [null];
			for (const [index, entry] of entries.entries()) {
				const sent = roomSession.send(
					JSON.stringify({
						type: "send",
						content: index === 0 ? composerText.value : "",
						attachment: entry?.attachment || null,
						mentionUserIds: index === 0 ? mentionUserIds : [],
						replyMessageId: replyMessageId ? Number(replyMessageId) : null,
					}),
					key,
				);
				if (!sent) throw new Error(t('chat.realtimeNotReady'));
				composerText.value = "";
				if (entry) clearAttachment(entry.id);
			}
			return true;
		} catch (currentError) {
			error.value = currentError.message;
			return false;
		} finally {
			sending.value = false;
		}
	}

		async function sendVoiceMessage(recording, replyMessageId = null) {
			if (sending.value) return false;
			const key = roomKey();
			if (!roomSession.isOpenFor(key)) {
				error.value = t('chat.realtimeNotReady');
				return false;
			}
			sending.value = true;
			error.value = "";
			let attachment = null;
			try {
				const payload = await roomApi.uploadFile(recording.file);
				attachment = {
					...payload.file,
					kind: "voice",
					durationMs: recording.durationMs,
					waveform: recording.waveform,
				};
				const sent = roomSession.send(
					JSON.stringify({
						type: "send",
						content: "",
						attachment,
						mentionUserIds: [],
						replyMessageId: replyMessageId ? Number(replyMessageId) : null,
					}),
					key,
				);
				if (!sent) throw new Error(t('chat.realtimeNotReady'));
				return true;
			} catch (currentError) {
				if (roomKey() === key) {
					if (attachment) addReadyAttachment(attachment);
					error.value = currentError.message;
				}
				return false;
			} finally {
				sending.value = false;
			}
		}

	function deleteMessage(messageId) {
		const key = activeRoom.value
			? `${activeRoom.value.kind}:${activeRoom.value.id}`
			: "";
		if (!roomSession.isOpenFor(key)) {
			error.value = t('chat.realtimeNotReady');
			return false;
		}

		error.value = "";
		return roomSession.send(
			JSON.stringify({ type: "delete_message", messageId: Number(messageId) }),
			key,
		);
	}

	function pinMessage(messageId) {
		const key = roomKey();
		if (!roomSession.isOpenFor(key)) {
			error.value = t('chat.realtimeNotReady');
			return false;
		}
		error.value = "";
		return roomSession.send(
			JSON.stringify({ type: "pin_message", messageId: Number(messageId) }),
			key,
		);
	}

	function unpinMessage(messageId) {
		const key = roomKey();
		if (!roomSession.isOpenFor(key)) {
			error.value = t('chat.realtimeNotReady');
			return false;
		}
		error.value = "";
		return roomSession.send(
			JSON.stringify({ type: "unpin_message", messageId: Number(messageId) }),
			key,
		);
	}

	async function revealMessage(messageId) {
		const targetId = Number(messageId);
		const key = roomKey();
		if (!targetId || !key) {
			return false;
		}
		await nextTick();
		if (highlightMessage(targetId)) {
			return true;
		}

		try {
			const room = activeRoom.value;
			const payload = await roomApi.getMessages(room.kind, room.id, targetId + 1);
			if (roomKey() !== key) {
				return false;
			}
			pinnedMessage.value = payload.pinnedMessage || pinnedMessage.value;
			messages.value = mergeMessages(payload.messages, messages.value);
			await nextTick();
			return highlightMessage(targetId);
		} catch (currentError) {
			error.value = currentError.message;
			return false;
		}
	}

	function revealPinnedMessage() {
		return revealMessage(pinnedMessage.value?.id);
	}

	watch(() => roomKey(), clearAttachments, { flush: "sync" });

	async function loadOlder() {
		if (loading.value) {
			return;
		}
		const firstMessage = messages.value[0];
		if (firstMessage) {
			await loadMessages(firstMessage.id, true);
		}
	}

	watch(
		messages,
		(current, previous) => {
			const receivedNewLastMessage =
				current.length > previous.length &&
				current.at(-1)?.id !== previous.at(-1)?.id;
			if (receivedNewLastMessage) {
				nextTick().then(scrollToBottom);
			}
		},
		{ flush: "post" },
	);

	return {
		messages,
		pinnedMessage,
		highlightedMessageId,
		loading,
		wsStatus,
		composerText,
		pendingAttachments,
		sending,
		messagesEl,
		isOwnMessage,
		loadMessages,
		activateRoom,
		deactivateRoom,
		pauseRoom,
		connectSocket,
		disconnectSocket,
			sendMessage,
			sendVoiceMessage,
		deleteMessage,
		pinMessage,
			unpinMessage,
			revealMessage,
			revealPinnedMessage,
		uploadAttachment,
		clearAttachment,
		retryAttachment,
		loadOlder,
	};
}
