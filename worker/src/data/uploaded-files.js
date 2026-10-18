import { classifyStoredSiteIcon } from '../site-icon.js';
import { normalizeContentType } from '../attachment-metadata.js';

export function isR2ObjectUnavailableError(error) {
	const message = String(error?.message || error);
	return (
		message.includes("r2_object_pending_delete") ||
		message.includes("r2_local_object_unavailable")
	);
}

// ownerUserId 傳 null 時登記為系統檔案（如 Telegram 導入）；data 為加密後 BLOB。
export async function recordUploadedFile(
	db,
	{ key, ownerUserId = null, filename, contentType, size, clientUploadId = null, data = null },
) {
	await db
		.prepare(
			`INSERT INTO uploaded_files (
				   object_key, owner_user_id, filename, content_type, size, data, client_upload_id, created_at
				 ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
				 ON CONFLICT(object_key) DO UPDATE SET
				   owner_user_id = excluded.owner_user_id,
				   filename = excluded.filename,
				   content_type = excluded.content_type,
				   size = excluded.size,
				   data = excluded.data,
				   client_upload_id = excluded.client_upload_id`,
		)
		.bind(
			String(key),
			ownerUserId == null ? null : Number(ownerUserId),
			String(filename || ""),
			String(contentType || ""),
			Number(size || 0),
			data,
			clientUploadId ? String(clientUploadId) : null,
		)
		.run();
}

function toBlob(value) {
	if (value == null) return null;
	if (value instanceof Uint8Array) return new Uint8Array(value);
	if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
		return new Uint8Array(value);
	}
	if (ArrayBuffer.isView(value)) {
		return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	}
	return null;
}

export async function getFileRecord(db, key) {
	const { results } = await db
		.prepare(
			`SELECT object_key, owner_user_id, filename, content_type, size, data, created_at
			 FROM uploaded_files WHERE object_key = ? LIMIT 1`,
		)
		.bind(String(key))
		.all();
	const row = results[0];
	return row
		? {
				key: row.object_key,
				ownerUserId: row.owner_user_id == null ? null : Number(row.owner_user_id),
				filename: row.filename,
				contentType: row.content_type,
				size: Number(row.size || 0),
				data: toBlob(row.data),
				createdAt: row.created_at,
			}
		: null;
}

// GC 一次判斷一批 key 中哪些已內嵌 D1 數據，決定是否需要外部桶刪除。
export async function findD1OwnedFileKeys(db, keys) {
	const unique = [...new Set(keys.map((value) => String(value || "").trim()).filter(Boolean))];
	if (!unique.length) return new Set();
	const placeholders = Array.from({ length: unique.length }, () => "?").join(", ");
	const { results } = await db
		.prepare(
			`SELECT object_key FROM uploaded_files
			 WHERE object_key IN (${placeholders}) AND data IS NOT NULL`,
		)
		.bind(...unique)
		.all();
	return new Set(results.map((row) => String(row.object_key)));
}

export async function deleteFileObject(db, key) {
	const result = await db
		.prepare("DELETE FROM uploaded_files WHERE object_key = ?")
		.bind(String(key))
		.run();
	return Number(result?.meta?.changes || 0);
}

function mapUploadedFile(row) {
	return row
		? {
				key: row.object_key,
				name: row.filename,
				type: row.content_type,
				size: Number(row.size || 0),
				url: `/files/${encodeURIComponent(row.object_key)}`,
			}
		: null;
}

export async function getUploadedFileByClientId(db, userId, clientUploadId) {
	const { results } = await db
		.prepare(
			`SELECT object_key, filename, content_type, size
			 FROM uploaded_files
			 WHERE owner_user_id = ? AND client_upload_id = ?
			 LIMIT 1`,
		)
		.bind(Number(userId), String(clientUploadId))
		.all();
	return mapUploadedFile(results[0]);
}

export async function getUploadedFileMetadata(db, key) {
	const { results } = await db
		.prepare(
			`SELECT filename, content_type, size
			 FROM uploaded_files WHERE object_key = ? LIMIT 1`,
		)
		.bind(String(key))
		.all();
	const row = results[0];
	return row
		? {
				filename: row.filename,
				contentType: row.content_type,
				size: Number(row.size || 0),
			}
		: null;
}

export async function getOwnedUploadedFileMetadata(db, key, userId) {
	const { results } = await db
		.prepare(
			`SELECT filename, content_type, size
			 FROM uploaded_files
			 WHERE object_key = ? AND owner_user_id = ?
			   AND NOT EXISTS (
			     SELECT 1 FROM pending_r2_delete
			     WHERE pending_r2_delete.object_key = uploaded_files.object_key
			   )
			 LIMIT 1`,
		)
		.bind(String(key), Number(userId))
		.all();
	const row = results[0];
	return row
		? {
				filename: row.filename,
				contentType: row.content_type,
				size: Number(row.size || 0),
			}
		: null;
}

export async function fileBelongsToUser(db, key, userId) {
	const { results } = await db
		.prepare(
			`SELECT 1 AS found FROM uploaded_files
			 WHERE object_key = ? AND owner_user_id = ?
			   AND NOT EXISTS (
			     SELECT 1 FROM pending_r2_delete
			     WHERE pending_r2_delete.object_key = uploaded_files.object_key
			   )
			 LIMIT 1`,
		)
		.bind(String(key), Number(userId))
		.all();
	return Boolean(results[0]);
}

export async function canAccessFile(db, key, userId = null, trustedOrigins = []) {
	const cleanKey = String(key || "");
	if (!cleanKey) return false;

	// 頭像與當前站點圖標是公開資料；未保存的上傳仍需上傳者認證才能預覽。
	const publicRefs = await db
		.prepare(
			`SELECT (
			     EXISTS (SELECT 1 FROM users WHERE avatar_key = ? AND deleted_at IS NULL)
			     OR EXISTS (SELECT 1 FROM channels WHERE avatar_key = ? AND deleted_at IS NULL)
			   ) AS public_reference,
			   (SELECT setting_value FROM site_settings WHERE setting_key = 'site_icon_url') AS site_icon_url,
			   (SELECT content_type FROM uploaded_files WHERE object_key = ?) AS site_icon_content_type
			 WHERE NOT EXISTS (SELECT 1 FROM pending_r2_delete WHERE object_key = ?)`,
		)
		.bind(cleanKey, cleanKey, cleanKey, cleanKey)
		.all();
	const refs = publicRefs.results[0];
	if (!refs) return false;
	if (refs.public_reference) return true;
	const icon = classifyStoredSiteIcon(refs.site_icon_url, trustedOrigins);
	const iconContentType = normalizeContentType(refs.site_icon_content_type);
	if (icon.kind === 'local' && icon.key === cleanKey &&
		iconContentType.startsWith('image/') && iconContentType !== 'image/svg+xml') return true;
	if (!Number.isFinite(Number(userId))) return false;

	// 發送前允許上傳者預覽；發送後則按消息所在公開群組或成員關係授權。
	const { results } = await db
		.prepare(
			`SELECT 1 AS found
			 WHERE NOT EXISTS (SELECT 1 FROM pending_r2_delete WHERE object_key = ?)
			   AND (EXISTS (
			   SELECT 1 FROM uploaded_files uf
			   WHERE uf.object_key = ? AND uf.owner_user_id = ?
			 ) OR EXISTS (
			   SELECT 1 FROM messages m
			   JOIN channels c ON c.id = m.channel_id
			   WHERE m.attachment_key = ?
			     AND m.deleted_at IS NULL AND c.deleted_at IS NULL
			     AND (c.kind = 'public' OR EXISTS (
			       SELECT 1 FROM channel_members cm
			       WHERE cm.channel_id = c.id AND cm.user_id = ?
			     ))
			 ))`,
		)
		.bind(cleanKey, cleanKey, Number(userId), cleanKey, Number(userId))
		.all();
	return Boolean(results[0]);
}
