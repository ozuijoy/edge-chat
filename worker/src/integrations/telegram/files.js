import { MAX_FILE_SIZE_DEFAULT } from "../../utils.js";
import {
	normalizeContentType,
	safeFilenameExtension,
	sanitizeFilename,
} from "../../attachment-metadata.js";
import { decryptAttachment, encryptAttachment } from "../../encryption.js";
import { deleteFileObject, getFileRecord, recordUploadedFile } from "../../data/uploaded-files.js";
import { downloadTelegramFile, getTelegramFile } from "./client.js";

// D1 單列內嵌檔案的存储上限；環境變量可進一步收窄。
export const TELEGRAM_BRIDGE_FILE_LIMIT = MAX_FILE_SIZE_DEFAULT;
  export const TELEGRAM_FILE_SKIP_REASON = Object.freeze({
	TOO_LARGE: "too_large",
	NOT_FOUND: "not_found",
	STORAGE_UNAVAILABLE: "storage_unavailable",
  });

function fileLimitFor(env) {
	const configured = Number(env?.MAX_FILE_SIZE);
	return Number.isFinite(configured) && configured > 0
		? Math.min(TELEGRAM_BRIDGE_FILE_LIMIT, configured)
		: TELEGRAM_BRIDGE_FILE_LIMIT;
}

function telegramObjectKey({ telegramChatId, telegramMessageId, filename }) {
	const extension = safeFilenameExtension(filename);
	return `telegram/${telegramChatId}/${telegramMessageId}-${crypto.randomUUID()}${extension}`;
}

export async function importTelegramAttachment(env, {
	botToken,
	telegramChatId,
	telegramMessageId,
	attachment,
}) {
  if (!attachment) return { attachment: null, skipReason: null };
  if (!env?.DB) {
    return { attachment: null, skipReason: TELEGRAM_FILE_SKIP_REASON.STORAGE_UNAVAILABLE };
  }
  const limit = fileLimitFor(env);
	if (attachment.fileSize > limit) {
		return { attachment: null, skipReason: TELEGRAM_FILE_SKIP_REASON.TOO_LARGE };
	}

	const telegramFile = await getTelegramFile(botToken, attachment.fileId);
	const resolvedSize = Number(telegramFile.file_size || attachment.fileSize || 0);
	if (resolvedSize > limit) {
		return { attachment: null, skipReason: TELEGRAM_FILE_SKIP_REASON.TOO_LARGE };
	}
	const bytes = await downloadTelegramFile(botToken, telegramFile.file_path, limit);
	const name = sanitizeFilename(attachment.fileName);
	const type = normalizeContentType(attachment.mimeType) || "application/octet-stream";
	const key = telegramObjectKey({ telegramChatId, telegramMessageId, filename: name });
	// Telegram 只負責傳輸，正式附件在進入消息前即轉換為 EdgeChat 自有加密 D1 對象（系統歸屬）。
	const encrypted = await encryptAttachment(env, bytes, key);
	await recordUploadedFile(env.DB, {
		key,
		ownerUserId: null,
		filename: name,
		contentType: type,
		size: bytes.byteLength,
		data: encrypted,
	});
	return {
		attachment: {
			key,
			name,
			type,
			size: bytes.byteLength,
				...(attachment.kind === "voice" || attachment.kind === "audio"
					? {
						kind: attachment.kind,
						durationMs: attachment.durationMs || 0,
						...(attachment.kind === "voice" ? { waveform: [] } : {}),
					}
					: {}),
		},
		skipReason: null,
	};
}

  export async function loadEdgeChatAttachment(env, attachment) {
	if (!attachment) {
		return { file: null, skipReason: TELEGRAM_FILE_SKIP_REASON.NOT_FOUND };
	}
	if (!env?.DB) {
		return { file: null, skipReason: TELEGRAM_FILE_SKIP_REASON.STORAGE_UNAVAILABLE };
	}
	const limit = fileLimitFor(env);
	if (Number(attachment.size) > limit) {
		return { file: null, skipReason: TELEGRAM_FILE_SKIP_REASON.TOO_LARGE };
	}
	const record = await getFileRecord(env.DB, attachment.key);
	let raw = null;
	if (record?.data) {
		raw = record.data;
	} else if (env.FILES) {
		const object = await env.FILES.get(attachment.key);
		if (object) raw = new Uint8Array(await object.arrayBuffer());
	}
	if (!raw) {
		return { file: null, skipReason: TELEGRAM_FILE_SKIP_REASON.NOT_FOUND };
	}
	const decrypted = await decryptAttachment(env, raw, attachment.key);
	if (decrypted.bytes.byteLength > limit) {
		return { file: null, skipReason: TELEGRAM_FILE_SKIP_REASON.TOO_LARGE };
	}
	return {
		file: {
			bytes: decrypted.bytes,
			name: sanitizeFilename(attachment.name),
				type: normalizeContentType(attachment.type) || "application/octet-stream",
				size: decrypted.bytes.byteLength,
				kind: attachment.kind,
				durationMs: Number(attachment.durationMs || 0),
		},
		skipReason: null,
	};
}

export async function deleteImportedTelegramAttachment(env, attachment) {
	if (!attachment?.key) return;
	try {
		const record = await getFileRecord(env.DB, attachment.key);
		// 未回填的舊對象仍在 R2 桶；已內嵌 D1 的記錄只需移除行。
		if (record?.data == null && env.FILES) {
			await env.FILES.delete(attachment.key);
		}
		await deleteFileObject(env.DB, attachment.key);
	} catch (error) {
		console.warn(JSON.stringify({
			message: "telegram orphan attachment delete failed",
			objectKey: attachment.key,
			error: error instanceof Error ? error.message : String(error),
		}));
	}
}
