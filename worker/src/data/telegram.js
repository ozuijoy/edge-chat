import { decryptSecretValue, encryptSecretValue } from "../encryption.js";
import { managedGroupScope } from '../rbac/authorization.ts';

const BOT_TOKEN_CONTEXT = "telegram:bot-token";
const WEBHOOK_SECRET_CONTEXT = "telegram:webhook-secret";

function mapMapping(row) {
	return {
		id: Number(row.id),
		channelId: Number(row.channel_id),
		channelName: row.channel_name || "",
		channelKind: row.channel_kind || "",
		telegramChatId: String(row.telegram_chat_id),
		telegramChatTitle: row.telegram_chat_title || "",
		enabled: Boolean(Number(row.enabled)),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function listTelegramBridgeAdminState(env, actor = { isSuperAdmin: true, userId: 0 }) {
  const channelsScope = managedGroupScope(actor, 'channels.id');
  const mappingScope = managedGroupScope(actor, 'c.id');
	const [configResult, channelsResult, mappingsResult] = await Promise.all([
		env.DB.prepare(
			`SELECT bot_username, webhook_url, updated_at
			 FROM telegram_bridge_config
			 WHERE id = 1
			 LIMIT 1`,
		).all(),
		env.DB.prepare(
			`SELECT id, name, kind
			 FROM channels
			 WHERE kind IN ('public', 'private') AND deleted_at IS NULL AND ${channelsScope.sql}
			 ORDER BY CASE WHEN name = 'general' THEN 0 ELSE 1 END, name ASC LIMIT 100`,
		).bind(...channelsScope.params).all(),
		env.DB.prepare(
			`SELECT tm.id, tm.channel_id, c.name AS channel_name, c.kind AS channel_kind,
			        tm.telegram_chat_id,
			        tm.telegram_chat_title, tm.enabled, tm.created_at, tm.updated_at
			 FROM telegram_mappings tm
			 JOIN channels c ON c.id = tm.channel_id
			 WHERE c.kind IN ('public', 'private') AND c.deleted_at IS NULL AND ${mappingScope.sql}
			 ORDER BY tm.updated_at DESC, tm.id DESC LIMIT 100`,
		).bind(...mappingScope.params).all(),
	]);

	const config = configResult.results[0] || null;
	return {
		config: {
			configured: Boolean(config),
			botUsername: config?.bot_username || "",
			webhookUrl: actor.isSuperAdmin ? config?.webhook_url || "" : "",
			updatedAt: config?.updated_at || null,
		},
		channels: channelsResult.results.map((row) => ({
			id: Number(row.id),
			name: row.name,
			kind: row.kind,
		})),
		mappings: mappingsResult.results.map(mapMapping),
	};
}

export async function getTelegramCredentials(env) {
	const { results } = await env.DB.prepare(
		`SELECT bot_token_ciphertext, webhook_secret_ciphertext, bot_username, webhook_url
		 FROM telegram_bridge_config
		 WHERE id = 1
		 LIMIT 1`,
	).all();
	const row = results[0];
	if (!row) {
		return null;
	}

	const [botToken, webhookSecret] = await Promise.all([
		decryptSecretValue(env, row.bot_token_ciphertext, BOT_TOKEN_CONTEXT),
		decryptSecretValue(env, row.webhook_secret_ciphertext, WEBHOOK_SECRET_CONTEXT),
	]);
	return {
		botToken,
		webhookSecret,
		botUsername: row.bot_username || "",
		webhookUrl: row.webhook_url || "",
	};
}

export async function saveTelegramBridgeConfig(env, {
	botToken,
	webhookSecret,
	botUsername,
	webhookUrl,
	updatedBy,
}) {
	const previous = await env.DB.prepare(
		"SELECT bot_username FROM telegram_bridge_config WHERE id = 1",
	).first();
	const [botTokenCiphertext, webhookSecretCiphertext] = await Promise.all([
		encryptSecretValue(env, botToken, BOT_TOKEN_CONTEXT),
		encryptSecretValue(env, webhookSecret, WEBHOOK_SECRET_CONTEXT),
	]);
	await env.DB.prepare(
		`INSERT INTO telegram_bridge_config (
		   id, bot_token_ciphertext, webhook_secret_ciphertext,
		   bot_username, webhook_url, updated_by, updated_at
		 ) VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(id) DO UPDATE SET
		   bot_token_ciphertext = excluded.bot_token_ciphertext,
		   webhook_secret_ciphertext = excluded.webhook_secret_ciphertext,
		   bot_username = excluded.bot_username,
		   webhook_url = excluded.webhook_url,
		   updated_by = excluded.updated_by,
		   updated_at = CURRENT_TIMESTAMP`,
	)
		.bind(
			botTokenCiphertext,
			webhookSecretCiphertext,
			String(botUsername || ""),
			String(webhookUrl || ""),
			Number(updatedBy),
		)
		.run();
	// Telegram chat IDs belong to the configured bot's conversations. A different bot needs new user consent.
	if (previous && previous.bot_username !== String(botUsername || "")) {
		await env.DB.prepare("DELETE FROM telegram_notification_users").run();
		await env.DB.prepare("DELETE FROM telegram_notification_outbox WHERE status != 'sent'").run();
	}
}

export async function getTelegramMappingByChatId(db, telegramChatId) {
	const { results } = await db.prepare(
		`SELECT tm.id, tm.channel_id, c.name AS channel_name, c.kind AS channel_kind,
		        tm.telegram_chat_id, tm.telegram_chat_title, tm.enabled,
		        tm.created_at, tm.updated_at
		 FROM telegram_mappings tm
		 JOIN channels c ON c.id = tm.channel_id
		 WHERE tm.telegram_chat_id = ?
		   AND tm.enabled = 1
		   AND c.kind IN ('public', 'private')
		   AND c.deleted_at IS NULL
		 LIMIT 1`,
	)
		.bind(String(telegramChatId))
		.all();
	return results[0] ? mapMapping(results[0]) : null;
}

export async function listEnabledTelegramMappingsForChannel(db, channelId) {
	const { results } = await db.prepare(
		`SELECT tm.id, tm.channel_id, c.name AS channel_name, c.kind AS channel_kind,
		        tm.telegram_chat_id,
		        tm.telegram_chat_title, tm.enabled, tm.created_at, tm.updated_at
		 FROM telegram_mappings tm
		 JOIN channels c ON c.id = tm.channel_id
		 WHERE tm.channel_id = ?
		   AND tm.enabled = 1
		   AND c.kind IN ('public', 'private')
		   AND c.deleted_at IS NULL
		 ORDER BY tm.id ASC`,
	)
		.bind(Number(channelId))
		.all();
	return results.map(mapMapping);
}

export async function createTelegramMapping(db, {
	channelId,
	telegramChatId,
	telegramChatTitle,
	createdBy,
}) {
	const channelResult = await db.prepare(
		`SELECT id
		 FROM channels
		 WHERE id = ? AND kind IN ('public', 'private') AND deleted_at IS NULL
		 LIMIT 1`,
	)
		.bind(Number(channelId))
		.all();
	if (!channelResult.results[0]) {
		return null;
	}

	const result = await db.prepare(
		`INSERT INTO telegram_mappings (
		   channel_id, telegram_chat_id, telegram_chat_title, created_by
		 ) VALUES (?, ?, ?, ?)`,
	)
		.bind(
			Number(channelId),
			String(telegramChatId),
			String(telegramChatTitle || ""),
			Number(createdBy),
		)
		.run();
	return Number(result.meta.last_row_id);
}

export async function updateTelegramMapping(db, mappingId, { enabled }) {
	const result = await db.prepare(
		`UPDATE telegram_mappings
		 SET enabled = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE id = ?`,
	)
		.bind(enabled ? 1 : 0, Number(mappingId))
		.run();
	return Number(result.meta?.changes || 0) > 0;
}

export async function deleteTelegramMapping(db, mappingId) {
	const result = await db.prepare("DELETE FROM telegram_mappings WHERE id = ?")
		.bind(Number(mappingId))
		.run();
	return Number(result.meta?.changes || 0) > 0;
}
