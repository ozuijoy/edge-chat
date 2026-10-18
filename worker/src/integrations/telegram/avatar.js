import {
	downloadTelegramFile,
	getTelegramFile,
	getTelegramUserProfilePhotos,
	TelegramApiError,
} from "./client.js";

export const TELEGRAM_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

function largestPhotoSize(photoSizes) {
	return photoSizes.reduce((largest, current) => {
		const largestArea = Number(largest.width || 0) * Number(largest.height || 0);
		const currentArea = Number(current.width || 0) * Number(current.height || 0);
		if (currentArea !== largestArea) {
			return currentArea > largestArea ? current : largest;
		}
		return Number(current.file_size || 0) > Number(largest.file_size || 0)
			? current
			: largest;
	});
}

function avatarContentType(filePath) {
	const path = String(filePath || "").toLowerCase();
	if (path.endsWith(".png")) return "image/png";
	if (path.endsWith(".webp")) return "image/webp";
	return "image/jpeg";
}

export async function loadTelegramUserAvatar(botToken, userId) {
	const profilePhotos = await getTelegramUserProfilePhotos(botToken, userId);
	const photoSizes = profilePhotos?.photos?.[0] || [];
	if (!photoSizes.length) return null;

	const photo = largestPhotoSize(photoSizes);
	const telegramFile = await getTelegramFile(botToken, photo.file_id);
	if (Number(telegramFile.file_size || 0) > TELEGRAM_AVATAR_MAX_BYTES) {
		throw new TelegramApiError("Telegram 头像超过大小限制");
	}
	const bytes = await downloadTelegramFile(
		botToken,
		telegramFile.file_path,
		TELEGRAM_AVATAR_MAX_BYTES,
	);
	return {
		bytes,
		contentType: avatarContentType(telegramFile.file_path),
	};
}
