export const GENERAL_CHANNEL_NAME = "general";

export function isGeneralChannel(channel) {
	return channel?.kind !== "dm" && channel?.name === GENERAL_CHANNEL_NAME;
}

export function isReservedGeneralChannelName(name) {
	return String(name || "").trim().toLowerCase() === GENERAL_CHANNEL_NAME;
}

export async function ensureGeneralChannelMembership(db, userId) {
	const normalizedUserId = Number(userId);
	if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
		throw new TypeError("general 群組成員必須是有效用戶");
	}

	// 運行時繼續做冪等修復，避免漏跑遷移或歷史異常數據讓當前用戶失去系統群訪問權。
	await db.batch([
		db
			.prepare(
				`INSERT OR IGNORE INTO channels (name, description, kind, created_by)
				 VALUES (?, '', 'public', NULL)`,
			)
			.bind(GENERAL_CHANNEL_NAME),
		db
			.prepare(
				`INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, invited_by)
				 SELECT c.id, ?, 'member', NULL
				 FROM channels c
				 WHERE c.name = ?
				   AND c.kind = 'public'
				   AND c.deleted_at IS NULL`,
			)
			.bind(normalizedUserId, GENERAL_CHANNEL_NAME),
	]);
}
