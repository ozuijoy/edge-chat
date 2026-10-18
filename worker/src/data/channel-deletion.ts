interface Statement {
	bind(...values: number[]): Statement;
}

interface Database {
	prepare(sql: string): Statement;
	batch(statements: Statement[]): Promise<{ meta: { changes: number } }[]>;
}

function placeholders(length: number) {
	return Array.from({ length }, () => "?").join(", ");
}

// API 和歷史群組 GC 共用這一事務，避免不同入口遺漏關聯記錄或繼續佔用群名。
export async function hardDeleteChannel(db: Database, channelId: number) {
	return hardDeleteChannels(db, [channelId]);
}

export async function hardDeleteChannels(db: Database, channelIds: number[]) {
	const ids = [...new Set(channelIds.map(Number).filter(Number.isInteger))];
	if (!ids.length) {
		return {
			channelsDeleted: 0,
			channelMessagesDeleted: 0,
			channelMembersDeleted: 0,
			r2DeleteQueued: 0,
		};
	}
	const target = `SELECT id FROM channels
			WHERE id IN (${placeholders(ids.length)})
			  AND kind IN ('public', 'private') AND name != 'general'`;
	const [queued, messages, members, , channel] = await db.batch([
		// 文件鍵先持久化再刪消息；R2 由已有隊列分批清理，失敗或進程中斷也不會丟失任務。
		db.prepare(
			`INSERT OR IGNORE INTO pending_r2_delete (object_key)
			 SELECT attachment_key FROM messages
			 WHERE channel_id IN (${target}) AND attachment_key IS NOT NULL AND attachment_key != ''
			 UNION
			 SELECT avatar_key FROM channels
			 WHERE id IN (${target}) AND avatar_key IS NOT NULL AND avatar_key != ''`,
			).bind(...ids, ...ids),
		db.prepare(`DELETE FROM messages WHERE channel_id IN (${target})`).bind(...ids),
		db.prepare(`DELETE FROM channel_members WHERE channel_id IN (${target})`).bind(...ids),
		// 已讀游標沒有級聯外鍵，必須先顯式刪除；置頂、同步事件和 Telegram 映射由外鍵級聯。
		db.prepare(`DELETE FROM message_reads WHERE channel_id IN (${target})`).bind(...ids),
		db.prepare(`DELETE FROM channels WHERE id IN (${target})`).bind(...ids),
	]);

	return {
		channelsDeleted: channel.meta.changes,
		channelMessagesDeleted: messages.meta.changes,
		channelMembersDeleted: members.meta.changes,
		r2DeleteQueued: queued.meta.changes,
	};
}
