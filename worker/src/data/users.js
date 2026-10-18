import { publicFileUrl } from "../utils.js";
import { activeUserSql, projectUserBan } from "../user-status.js";
import { AUTHORIZATION_COLUMNS, AUTHORIZATION_JOIN, authorizationFromRow } from '../rbac/authorization.ts';

function mapUserSummary(row) {
	return {
		id: Number(row.id),
		username: row.username,
		displayName: row.display_name,
		avatarUrl: row.avatar_key ? publicFileUrl(row.avatar_key) : "",
	};
}

export async function getUserProfile(db, userId) {
	const { results } = await db.prepare(
		`SELECT id, username, display_name, avatar_key, bio
		 FROM users WHERE id = ? AND deleted_at IS NULL AND ${activeUserSql()} LIMIT 1`,
	).bind(userId).all();
	const row = results[0];
	return row ? { ...mapUserSummary(row), bio: row.bio } : null;
}

function mapAdminUser(row, includePermissions) {
	const { permissions, ...identity } = authorizationFromRow(row);
	return {
		...mapUserSummary(row),
		...projectUserBan(row),
		createdAt: row.created_at,
		...identity,
		...(includePermissions ? { permissions } : {}),
	};
}

export async function getUserByUsername(db, username) {
	const { results } = await db
		.prepare(
				`SELECT u.*, ${AUTHORIZATION_COLUMNS}
				 FROM users u ${AUTHORIZATION_JOIN}
				 WHERE u.username = ?
				   AND u.deleted_at IS NULL
			 LIMIT 1`,
		)
		.bind(username)
		.all();
	return results[0] || null;
}

export async function isUserActiveById(db, userId) {
	const { results } = await db
		.prepare(
			`SELECT id
			 FROM users
			 WHERE id = ?
			   AND deleted_at IS NULL
				   AND ${activeUserSql()}
			 LIMIT 1`,
		)
		.bind(Number(userId))
		.all();
	return Boolean(results[0]);
}

export async function listActiveUsers(db, excludeUserId) {
	const { results } = await db
		.prepare(
			`SELECT id, username, display_name, avatar_key
			 FROM users
			 WHERE deleted_at IS NULL
				   AND ${activeUserSql()}
			   AND id != ?
			 ORDER BY display_name ASC`,
		)
		.bind(Number(excludeUserId))
		.all();
	return results.map(mapUserSummary);
}

export async function listContacts(db) {
	const { results } = await db
		.prepare(
			`SELECT id, username, display_name, avatar_key
			 FROM users
			 WHERE deleted_at IS NULL
			   AND ${activeUserSql()}
			 ORDER BY display_name ASC, username ASC, id ASC`,
		)
		.all();
	return results.map(mapUserSummary);
}

export async function listAdminUsers(db, offset = 0, actor = null) {
	const { results } = await db
		.prepare(
				`SELECT u.id, u.username, u.display_name, u.avatar_key, u.is_disabled, u.disabled_until, u.created_at,
           ${AUTHORIZATION_COLUMNS}
				 FROM users u ${AUTHORIZATION_JOIN}
				 WHERE u.deleted_at IS NULL
				 ORDER BY u.created_at DESC, u.id DESC LIMIT 100 OFFSET ?`,
		)
			.bind(offset)
		.all();
	return results.map((row) => mapAdminUser(row, actor?.isSuperAdmin));
}

export async function listStorageOwners(db) {
	const { results } = await db
		.prepare(
			`SELECT id, username, display_name, deleted_at
			 FROM users
			 ORDER BY id ASC`,
		)
		.all();
	return results.map((row) => ({
		id: Number(row.id),
		username: row.username,
		displayName: row.display_name,
		isDeleted: Boolean(row.deleted_at),
	}));
}
