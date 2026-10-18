import assert from "node:assert/strict";
import test from "node:test";

import { encryptSecretValue } from "../worker/src/encryption.js";
import worker from "../worker/src/index.js";

const keyring = JSON.stringify({
	activeKeyId: "v1",
	keys: {
		v1: Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index + 1)).toString(
			"base64",
		),
	},
});

function createCache() {
	const entries = new Map();
	return {
		entries,
		cache: {
			async match(request) {
				return entries.get(request.url)?.clone();
			},
			async put(request, response) {
				entries.set(request.url, response.clone());
			},
		},
	};
}

async function createEnv({ knownSender = true } = {}) {
	const [botTokenCiphertext, webhookSecretCiphertext] = await Promise.all([
		encryptSecretValue({ EDGECHAT_ENCRYPTION_KEYRING: keyring }, "123:secret", "telegram:bot-token"),
		encryptSecretValue(
			{ EDGECHAT_ENCRYPTION_KEYRING: keyring },
			"webhook-secret",
			"telegram:webhook-secret",
		),
	]);
	return {
		EDGECHAT_ENCRYPTION_KEYRING: keyring,
		DB: {
			prepare(sql) {
				const query = {
					binds: [],
					bind(...binds) {
						this.binds = binds;
						return this;
					},
					async all() {
						if (sql.includes("FROM site_settings")) return { results: [] };
						if (sql.includes("FROM messages")) {
							const matches = knownSender && this.binds[0] === "telegram" && this.binds[1] === "42";
							return { results: matches ? [{ found: 1 }] : [] };
						}
						if (sql.includes("FROM telegram_bridge_config")) {
							return {
								results: [{
									bot_token_ciphertext: botTokenCiphertext,
									webhook_secret_ciphertext: webhookSecretCiphertext,
									bot_username: "edgechat_bot",
									webhook_url: "https://example.com/webhook",
								}],
							};
						}
						throw new Error(`Unexpected SQL: ${sql}`);
					},
				};
				return query;
			},
		},
	};
}

test("Telegram 头像端点选择最大尺寸并写入 Edge Cache", async () => {
	const originalFetch = globalThis.fetch;
	const originalCaches = globalThis.caches;
	const { cache, entries } = createCache();
	const requests = [];
	globalThis.caches = { default: cache };
	globalThis.fetch = async (url, init) => {
		requests.push({ url: String(url), init });
		if (String(url).endsWith("/getUserProfilePhotos")) {
			return Response.json({
				ok: true,
				result: {
					photos: [[
						{ file_id: "small", width: 160, height: 160, file_size: 100 },
						{ file_id: "large", width: 640, height: 640, file_size: 400 },
					]],
				},
			});
		}
		if (String(url).endsWith("/getFile")) {
			return Response.json({
				ok: true,
				result: { file_path: "photos/avatar.jpg", file_size: 4 },
			});
		}
		return new Response(Uint8Array.from([255, 216, 255, 217]), {
			headers: { "content-length": "4", "content-type": "image/jpeg" },
		});
	};

	try {
		const env = await createEnv();
		const request = new Request("https://example.com/api/integrations/telegram/avatar/42?token=hidden");
		const first = await worker.fetch(request, env, {});
		const second = await worker.fetch(request, env, {});

		assert.equal(first.status, 200);
		assert.equal(first.headers.get("content-type"), "image/jpeg");
		assert.equal(first.headers.get("cache-control"), "public, max-age=3600, s-maxage=86400");
		assert.deepEqual(new Uint8Array(await first.arrayBuffer()), Uint8Array.from([255, 216, 255, 217]));
		assert.equal(second.status, 200);
		assert.equal(requests.length, 3);
		assert.deepEqual(JSON.parse(requests[0].init.body), { user_id: 42, offset: 0, limit: 1 });
		assert.deepEqual(JSON.parse(requests[1].init.body), { file_id: "large" });
		assert.equal(entries.has("https://example.com/api/integrations/telegram/avatar/42"), true);
		assert.equal(entries.has("https://example.com/api/integrations/telegram/avatar/42?token=hidden"), false);
		assert.equal(JSON.stringify([...first.headers]).includes("123:secret"), false);
	} finally {
		globalThis.fetch = originalFetch;
		globalThis.caches = originalCaches;
	}
});

test("非法 Telegram user ID 不查询业务数据（入口只读取隐身设置）", async () => {
	const response = await worker.fetch(
		new Request("https://example.com/api/integrations/telegram/avatar/not-a-user"),
		{
			DB: {
				prepare(sql) {
					if (sql.includes("FROM site_settings")) return { async all() { return { results: [] }; } };
					throw new Error("非法 ID 不应查询数据库");
				},
			},
		},
		{},
	);

	assert.equal(response.status, 404);
	assert.deepEqual(await response.json(), { error: "头像不存在" });
});

test("未知 Telegram sender 不请求 Telegram API", async () => {
	const originalFetch = globalThis.fetch;
	const originalCaches = globalThis.caches;
	let fetchCount = 0;
	globalThis.fetch = async () => {
		fetchCount += 1;
		throw new Error("不应请求 Telegram");
	};
	globalThis.caches = { default: createCache().cache };

	try {
		const response = await worker.fetch(
			new Request("https://example.com/api/integrations/telegram/avatar/99"),
			await createEnv({ knownSender: false }),
			{},
		);
		assert.equal(response.status, 404);
		assert.deepEqual(await response.json(), { error: "头像不存在" });
		assert.equal(fetchCount, 0);
	} finally {
		globalThis.fetch = originalFetch;
		globalThis.caches = originalCaches;
	}
});

test("Telegram 用户无头像时短暂缓存 404", async () => {
	const originalFetch = globalThis.fetch;
	const originalCaches = globalThis.caches;
	const { cache } = createCache();
	let fetchCount = 0;
	globalThis.caches = { default: cache };
	globalThis.fetch = async () => {
		fetchCount += 1;
		return Response.json({ ok: true, result: { photos: [] } });
	};

	try {
		const env = await createEnv();
		const request = new Request("https://example.com/api/integrations/telegram/avatar/42");
		const first = await worker.fetch(request, env, {});
		const second = await worker.fetch(request, env, {});

		assert.equal(first.status, 404);
		assert.equal(first.headers.get("cache-control"), "public, max-age=600, s-maxage=600");
		assert.equal(second.status, 404);
		assert.equal(fetchCount, 1);
		assert.equal((await second.json()).error, "头像不存在");
	} finally {
		globalThis.fetch = originalFetch;
		globalThis.caches = originalCaches;
	}
});
