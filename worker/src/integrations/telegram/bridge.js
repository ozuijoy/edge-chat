import {
	getTelegramCredentials,
	listEnabledTelegramMappingsForChannel,
} from "../../data/telegram.js";
import { isGroupChannelKind } from "../../../../shared/group-channel.ts";
import { isLocalBridgeMessage } from "../bridge-policy.ts";
import { getMessageBySource } from "../../data/messages.js";
import {
	findMessageReplyBySource,
	getMessageSourceReference,
} from "../../data/replies.js";
import { submitExternalRoomMessage } from "../../do-bridge.js";
import { sendTelegramMedia, sendTelegramText } from "./client.js";
import {
	deleteImportedTelegramAttachment,
	importTelegramAttachment,
	loadEdgeChatAttachment,
	TELEGRAM_FILE_SKIP_REASON,
} from "./files.js";

function logBridgeFailure(message, data) {
	console.warn(JSON.stringify({ message, ...data }));
}

function escapeTelegramHtml(value) {
	return String(value || "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

export function formatTelegramMessage(displayName, content = "") {
	const sender = `<b>${escapeTelegramHtml(displayName)}:</b>`;
	const body = escapeTelegramHtml(content);
	return body ? `${sender}\n${body}` : sender;
}

export function splitTelegramFormattedMessage(displayName, content, limit) {
	const characters = Array.from(String(content || ""));
	if (!characters.length) return [formatTelegramMessage(displayName)];
	const sender = formatTelegramMessage(displayName);
	const prefix = `${sender}\n`;
	const chunks = [];
	let current = "";
	for (const character of characters) {
		const escaped = escapeTelegramHtml(character);
		if (Array.from(prefix + current + escaped).length > limit && current) {
			chunks.push(prefix + current);
			current = escaped;
		} else {
			current += escaped;
		}
	}
	if (current) chunks.push(prefix + current);
	return chunks;
}

function telegramMediaKind(contentType, attachmentKind) {
	if (attachmentKind === "voice") return "voice";
	if (contentType.startsWith("image/")) return "photo";
	if (contentType.startsWith("video/")) return "video";
	if (contentType.startsWith("audio/")) return "audio";
	return "document";
}

async function sendTextMessage(botToken, chatId, displayName, content, replyToMessageId = null) {
	const chunks = splitTelegramFormattedMessage(displayName, content, 4096);
	for (const [index, chunk] of chunks.entries()) {
		await sendTelegramText(botToken, {
			chatId,
			text: chunk,
			replyToMessageId: index === 0 ? replyToMessageId : null,
		});
	}
}

async function sendMessageToTelegram(env, botToken, mapping, message, replyToMessageId = null) {
	const displayName = message.sender.displayName;
	if (!message.attachment) {
		if (message.content) {
			await sendTextMessage(
				botToken,
				mapping.telegramChatId,
				displayName,
				message.content,
				replyToMessageId,
			);
		}
		return;
	}

	const loaded = await loadEdgeChatAttachment(env, message.attachment);
	if (!loaded.file) {
		logBridgeFailure("telegram outbound attachment skipped", {
			roomId: Number(mapping.channelId),
			mappingId: mapping.id,
			reason: loaded.skipReason,
		});
			if (message.content) {
				await sendTextMessage(
					botToken,
					mapping.telegramChatId,
					displayName,
					message.content,
					replyToMessageId,
				);
		}
		return;
	}
	const file = loaded.file;

	const captions = splitTelegramFormattedMessage(displayName, message.content, 1024);
	await sendTelegramMedia(botToken, {
		chatId: mapping.telegramChatId,
		kind: telegramMediaKind(file.type, file.kind),
		bytes: file.bytes,
		filename: file.name,
		contentType: file.type,
		caption: captions[0],
		durationMs: file.durationMs,
		replyToMessageId,
	});
	for (const chunk of captions.slice(1)) {
		await sendTelegramText(botToken, { chatId: mapping.telegramChatId, text: chunk });
	}
}

function telegramReplyMessageId(reference, telegramChatId) {
	if (reference?.source !== "telegram") return null;
	const prefix = `${telegramChatId}:`;
	if (!reference.sourceMessageId.startsWith(prefix)) return null;
	const messageId = Number(reference.sourceMessageId.slice(prefix.length));
	return Number.isInteger(messageId) && messageId > 0 ? messageId : null;
}

export async function forwardEdgeChatMessageToTelegram(env, { room, message }) {
	if (!isGroupChannelKind(room.kind) || !isLocalBridgeMessage(message)) {
		return;
	}

	try {
		const [credentials, mappings, replyReference] = await Promise.all([
			getTelegramCredentials(env),
			listEnabledTelegramMappingsForChannel(env.DB, room.id),
			message.replyToMessageId
				? getMessageSourceReference(env.DB, {
					channelId: room.id,
					messageId: message.replyToMessageId,
				})
				: Promise.resolve(null),
		]);
		if (!credentials || !mappings.length || (!message.content && !message.attachment)) {
			return;
		}

		await Promise.all(
			mappings.map(async (mapping) => {
				try {
						await sendMessageToTelegram(
							env,
							credentials.botToken,
							mapping,
							message,
							telegramReplyMessageId(replyReference, mapping.telegramChatId),
						);
				} catch (error) {
					logBridgeFailure("telegram outbound message failed", {
						roomId: Number(room.id),
						mappingId: mapping.id,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}),
		);
	} catch (error) {
		logBridgeFailure("telegram outbound bridge failed", {
			roomId: Number(room.id),
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function ingestTelegramMessage(env, { mapping, telegramMessage, botToken }) {
	const existing = await getMessageBySource(
		env,
		"telegram",
		telegramMessage.sourceMessageId,
	);
	if (existing) return { ok: true, created: false };
	const reply = telegramMessage.replySourceMessageId
		? await findMessageReplyBySource(env.DB, {
			channelId: mapping.channelId,
			source: "telegram",
			sourceMessageId: telegramMessage.replySourceMessageId,
		})
		: null;

	let imported = { attachment: null, skipReason: null };
	if (telegramMessage.attachment) {
		if (!botToken) throw new Error("Telegram Bridge 未配置");
		imported = await importTelegramAttachment(env, {
			botToken,
			telegramChatId: telegramMessage.telegramChatId,
			telegramMessageId: telegramMessage.telegramMessageId,
			attachment: telegramMessage.attachment,
		});
	}

	const attachmentNotice =
		imported.skipReason === TELEGRAM_FILE_SKIP_REASON.TOO_LARGE
			? "附件超过 16 MB，未同步"
			: imported.skipReason === TELEGRAM_FILE_SKIP_REASON.STORAGE_UNAVAILABLE
				? "当前部署未启用文件存储，附件未同步"
				: "";
	const content = [telegramMessage.content, attachmentNotice].filter(Boolean).join("\n\n");
	try {
		const response = await submitExternalRoomMessage(env, {
			room: {
				id: mapping.channelId,
				kind: mapping.channelKind,
				name: mapping.channelName,
			},
			content,
			attachment: imported.attachment,
			source: "telegram",
			sourceMessageId: telegramMessage.sourceMessageId,
			sourceAttachmentId: telegramMessage.attachment?.fileId || null,
				sourceAttachmentUniqueId: telegramMessage.attachment?.fileUniqueId || null,
				externalSender: telegramMessage.sender,
				replyToMessageId: reply?.messageId || null,
				replyToSenderId: reply?.senderId || null,
			});
		if (!response.ok) {
			throw new Error(`Telegram 入站消息提交失败：${response.status}`);
		}
		const result = await response.json();
		if (!result.created) {
			await deleteImportedTelegramAttachment(env, imported.attachment);
		}
		return result;
	} catch (error) {
		// DO 响应中断时先按去重键复查，避免删除已经被正式消息引用的 R2 对象。
		const persisted = await getMessageBySource(
			env,
			"telegram",
			telegramMessage.sourceMessageId,
		).catch(() => null);
		if (persisted) {
			if (persisted.attachment?.key !== imported.attachment?.key) {
				await deleteImportedTelegramAttachment(env, imported.attachment);
			}
			return { ok: true, created: false, message: persisted };
		}
		await deleteImportedTelegramAttachment(env, imported.attachment);
		throw error;
	}
}
