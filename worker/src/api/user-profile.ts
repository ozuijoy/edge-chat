import type { Hono } from "hono";
import { validateBio, parseLocalUserId } from "../../../shared/user-profile.ts";
import { putSession } from "../auth.js";
import { resolveAvatarKeyUpdate, isR2ObjectUnavailableError } from "../avatar-policy.js";
import { getUserProfile } from "../data/users.js";
import { errorResponse, parseJsonRequest } from "../utils.js";

export function registerUserProfileRoutes(app: Hono) {
	app.get("/api/users/:id/profile", async (c) => {
		const id = parseLocalUserId(c.req.param("id"));
		if (id === null) return errorResponse("用戶 ID 無效", 400);
		const profile = await getUserProfile(c.env.DB, id);
		if (!profile) return errorResponse("用戶資料不可用", 404);
		return c.json({ profile });
	});

	app.patch("/api/me/profile", async (c) => {
		const session = c.get("session");
		const payload = await parseJsonRequest(c.req.raw);
		if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
			return errorResponse("參數無效");
		}
		const updates: string[] = [];
      if (Object.keys(payload).some((key) => !['displayName', 'bio', 'avatarKey'].includes(key))) return errorResponse('請求包含不允許修改的字段');
		const binds: (string | null)[] = [];
		if (Object.hasOwn(payload, "displayName")) {
			if (typeof payload.displayName !== "string" || !payload.displayName.trim()) {
				return errorResponse("顯示名稱不能為空");
			}
			updates.push("display_name = ?");
			binds.push(payload.displayName.trim());
		}
		if (Object.hasOwn(payload, "bio")) {
			let bio: string;
			try {
				bio = validateBio(payload.bio);
			} catch (error) {
				return errorResponse((error as Error).message);
			}
			updates.push("bio = ?");
			binds.push(bio);
		}
		const avatar = await resolveAvatarKeyUpdate(c.env.DB, session.userId, payload);
		if (avatar.provided) {
			updates.push("avatar_key = ?");
			binds.push(avatar.key);
		}
		if (updates.length) {
			try {
				await c.env.DB.prepare(
					`UPDATE users SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
					 WHERE id = ? AND deleted_at IS NULL`,
				).bind(...binds, session.userId).run();
			} catch (error) {
				if (isR2ObjectUnavailableError(error)) {
					return errorResponse("頭像文件不存在或正在清理，請重新上傳");
				}
				throw error;
			}
		}
		// 從 D1 重讀完整資料，不能用可能過期的 KV 快照補齊未提交字段。
		const profile = await getUserProfile(c.env.DB, session.userId);
		if (!profile) return errorResponse("用戶資料不可用", 404);
		const { id: _id, ...fields } = profile;
		const merged = { ...session, ...fields };
		await putSession(c.env, merged);
		return c.json({ session: merged });
	});
}
