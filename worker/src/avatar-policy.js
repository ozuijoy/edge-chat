import {
	getOwnedUploadedFileMetadata,
	isR2ObjectUnavailableError,
} from "./data/uploaded-files.js";
import { ApiError } from "./errors.js";

export { isR2ObjectUnavailableError };

export async function resolveAvatarKeyUpdate(db, userId, payload) {
	if (!Object.hasOwn(payload, "avatarKey")) {
		return { provided: false, key: null };
	}

	const key = String(payload.avatarKey || "").trim();
	if (!key) {
		return { provided: true, key: null };
	}

	const file = await getOwnedUploadedFileMetadata(db, key, userId);
	if (!file) {
		throw new ApiError("頭像只能使用當前賬號上傳的圖片");
	}
	if (!String(file.contentType || "").startsWith("image/")) {
		throw new ApiError("頭像文件必須是圖片");
	}

	return { provided: true, key };
}
