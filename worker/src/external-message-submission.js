import { insertExternalMessage } from "./data/messages.js";

export async function submitExternalMessage(env, { room, payload }) {
	const result = await insertExternalMessage(env, {
		channelId: room.id,
		content: payload.content,
		attachment: payload.attachment,
		externalSender: payload.externalSender,
		source: payload.source,
		sourceMessageId: payload.sourceMessageId,
		sourceAttachmentId: payload.sourceAttachmentId,
		sourceAttachmentUniqueId: payload.sourceAttachmentUniqueId,
		replyToMessageId: payload.replyToMessageId,
		replyToSenderId: payload.replyToSenderId,
		bridgeDelivery: payload.bridgeDelivery,
		sourceInstance: payload.sourceInstance,
	});
	return {
		...result,
		replyToSenderId: payload.replyToSenderId || null,
		packet: JSON.stringify({ type: "message", message: result.message }),
	};
}
