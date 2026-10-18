import assert from "node:assert/strict";
import test from "node:test";

import { resolveAvatarKeyUpdate } from "../worker/src/avatar-policy.js";

function createDb(row) {
	return {
		prepare() {
			return {
				bind() {
					return {
						async all() {
							return { results: row ? [row] : [] };
						},
					};
				},
			};
		},
	};
}

test("頭像更新只接受當前用戶上傳的圖片，並顯式支持清除", async () => {
	assert.deepEqual(await resolveAvatarKeyUpdate(createDb(), 7, {}), {
		provided: false,
		key: null,
	});
	assert.deepEqual(await resolveAvatarKeyUpdate(createDb(), 7, { avatarKey: null }), {
		provided: true,
		key: null,
	});
	assert.deepEqual(
		await resolveAvatarKeyUpdate(
			createDb({ filename: "avatar.png", content_type: "image/png", size: 10 }),
			7,
			{ avatarKey: "7/avatar.png" },
		),
		{ provided: true, key: "7/avatar.png" },
	);
	await assert.rejects(
		resolveAvatarKeyUpdate(createDb(), 7, { avatarKey: "8/private.png" }),
		/當前賬號上傳/,
	);
	await assert.rejects(
		resolveAvatarKeyUpdate(
			createDb({ filename: "report.pdf", content_type: "application/pdf", size: 10 }),
			7,
			{ avatarKey: "7/report.pdf" },
		),
		/必須是圖片/,
	);
});
