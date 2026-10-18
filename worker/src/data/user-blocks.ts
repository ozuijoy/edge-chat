import type { UserSummary } from "../../../shared/user-profile.ts";
import { publicFileUrl } from "../utils.js";

interface QueryResult<T> {
	results: T[];
}

interface RunResult {
	meta: { changes: number };
}

interface Statement {
	bind(...values: number[]): Statement;
	all<T>(): Promise<QueryResult<T>>;
	run(): Promise<RunResult>;
}

interface Database {
	prepare(sql: string): Statement;
}

interface UserBlockRow {
	target_exists: number;
	blocked_by_me: number;
	blocked_me: number;
}

interface DirectMessageBlockRow {
	blocked_by_sender: number;
	blocked_by_peer: number;
}

export interface UserBlockStatus {
	targetExists: boolean;
	blockedByMe: boolean;
	blockedMe: boolean;
}

export async function listBlockedUsers(db: Database, userId: number): Promise<UserSummary[]> {
	// 拉黑管理不按账号状态过滤，否则封禁或软删除后就无法从自己的列表移除。
	const { results } = await db.prepare(
		`SELECT u.id, u.username, u.display_name AS displayName, u.avatar_key
		 FROM user_blocks b JOIN users u ON u.id = b.blocked_id
		 WHERE b.blocker_id = ? ORDER BY b.created_at DESC, u.id`,
	).bind(userId).all<Omit<UserSummary, "avatarUrl"> & { avatar_key: string | null }>();
	return results.map(({ avatar_key, ...user }) => ({
		...user, avatarUrl: avatar_key ? publicFileUrl(avatar_key) : "",
	}));
}

export async function getUserBlockStatus(
	db: Database,
	userId: number,
	otherUserId: number,
): Promise<UserBlockStatus> {
	const { results } = await db
		.prepare(
			`SELECT
			   EXISTS(SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL) AS target_exists,
			   EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?) AS blocked_by_me,
			   EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?) AS blocked_me`,
		)
		.bind(otherUserId, userId, otherUserId, otherUserId, userId)
		.all<UserBlockRow>();
	const row = results[0];
	return {
		targetExists: Boolean(row?.target_exists),
		blockedByMe: Boolean(row?.blocked_by_me),
		blockedMe: Boolean(row?.blocked_me),
	};
}

export async function setUserBlocked(
	db: Database,
	blockerId: number,
	blockedId: number,
	blocked: boolean,
): Promise<void> {
	const statement = blocked
		? db.prepare(
				"INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)",
			)
		: db.prepare("DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?");
	await statement.bind(blockerId, blockedId).run();
}

export async function getDirectMessageBlockStatus(
	db: Database,
	channelId: number,
	senderId: number,
): Promise<{ blockedBySender: boolean; blockedByPeer: boolean }> {
	const { results } = await db
		.prepare(
			`SELECT
			   EXISTS(
			     SELECT 1 FROM user_blocks
			     WHERE blocker_id = ? AND blocked_id = peer.user_id
			   ) AS blocked_by_sender,
			   EXISTS(
			     SELECT 1 FROM user_blocks
			     WHERE blocker_id = peer.user_id AND blocked_id = ?
			   ) AS blocked_by_peer
			 FROM channel_members peer
			 WHERE peer.channel_id = ? AND peer.user_id != ?
			 LIMIT 1`,
		)
		.bind(senderId, senderId, channelId, senderId)
		.all<DirectMessageBlockRow>();
	const row = results[0];
	return {
		blockedBySender: Boolean(row?.blocked_by_sender),
		blockedByPeer: Boolean(row?.blocked_by_peer),
	};
}
