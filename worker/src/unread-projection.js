import {
	countUnreadAttention,
	countUnreadMessages,
	listRoomMemberIds,
} from "./data/unread.js";
import { notifyUserInbox } from "./do-bridge.js";
import { enqueueTelegramNotification } from "./integrations/telegram/notifications.js";

function logProjectionFailure(message, data) {
	console.warn(JSON.stringify({ message, ...data }));
}

export function createUnreadProjection({
	countUnread = countUnreadMessages,
	countMentions = countUnreadAttention,
	listMemberIds = listRoomMemberIds,
	notifyInbox = notifyUserInbox,
	logFailure = logProjectionFailure,
	enqueueNotification = enqueueTelegramNotification,
} = {}) {
	async function notifyRecipient(env, room, message, userId, replyToSenderId, senderId) {
		try {
			const mentionsMe = (message.mentionUserIds || []).includes(Number(userId));
			const replyToMe =
				Number(replyToSenderId ?? message.replyTo?.sender?.id) === Number(userId) &&
				(replyToSenderId !== null && replyToSenderId !== undefined
					? true
					: message.replyTo?.sender?.kind === "local");
			const needsAttention = mentionsMe || replyToMe;
			const [unreadCount, mentionUnreadCount] = await Promise.all([
				countUnread(env.DB, { channelId: room.id, userId }),
				needsAttention
					? countMentions(env.DB, { channelId: room.id, userId })
					: Promise.resolve(undefined),
			]);
			await notifyInbox(env, userId, {
				protocolVersion: 1,
				type: "room_message",
				room: {
					id: Number(room.id),
					kind: room.kind,
					name: room.name,
				},
				messageId: Number(message.id),
				createdAt: message.createdAt,
				unreadCount,
				...(mentionUnreadCount === undefined ? {} : { mentionUnreadCount }),
				mentionsMe,
				replyToMe,
				contentPreview: String(message.content || "").slice(0, 160),
				sender: message.sender,
			});
		} catch (error) {
			logFailure("unread recipient projection failed", {
				roomId: Number(room.id),
				userId: Number(userId),
				error: error instanceof Error ? error.message : String(error),
			});
		}
		if (room.kind === "dm" || (message.mentionUserIds || []).includes(Number(userId))) {
			try {
				await enqueueNotification(env, {
					userId,
					senderId,
					room,
					message,
					kind: room.kind === "dm" ? "dm" : "mention",
				});
			} catch (error) {
				logFailure("telegram notification projection failed", {
					roomId: Number(room.id), userId: Number(userId),
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	return async function projectUnreadMessage(
		env,
		{ room, senderId, message, replyToSenderId = null },
	) {
		try {
			const memberIds = await listMemberIds(env.DB, room.id);
			const recipientIds = memberIds.filter(
				(userId) => Number(userId) !== Number(senderId),
			);
			await Promise.all(
				recipientIds.map((userId) =>
					notifyRecipient(env, room, message, userId, replyToSenderId, senderId),
				),
			);
		} catch (error) {
			logFailure("unread projection failed", {
				roomId: Number(room.id),
				error: error instanceof Error ? error.message : String(error),
			});
		}
	};
}

export const projectUnreadMessage = createUnreadProjection();
