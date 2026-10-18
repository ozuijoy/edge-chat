import type { Hono } from "hono";
import { validateBio, parseLocalUserId } from "../../../shared/user-profile.ts";
import { putSession } from "../auth.js";
import { resolveAvatarKeyUpdate, isR2ObjectUnavailableError } from "../avatar-policy.js";
import { getUserProfile } from "../data/users.js";
import { errorResponse, parseJsonRequest } from "../utils.js";

export function registerUserProfileRoutes(app: Hono) {
	app.get("/api/users/:id/profile", async (c) => {
		const id = parseLocalUserId(c.req.param("id"));
		if (id === null) return errorResponse("用户 ID 无效", 400);
		const profile = await getUserProfile(c.env.DB, id);
		if (!profile) return errorResponse("用户资料不可用", 404);
		return c.json({ profile });
	});

	app.patch("/api/me/profile", async (c) => {
		const session = c.get("session");
		const payload = await parseJsonRequest(c.req.raw);
		if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
			return errorResponse("参数无效");
		}
		const updates: string[] = [];
      if (Object.keys(payload).some((key) => !['displayName', 'bio', 'avatarKey'].includes(key))) return errorResponse('请求包含不允许修改的字段');
		const binds: (string | null)[] = [];
		if (Object.hasOwn(payload, "displayName")) {
			if (typeof payload.displayName !== "string" || !payload.displayName.trim()) {
				return errorResponse("显示名称不能为空");
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
					return errorResponse("头像文件不存在或正在清理，请重新上传");
				}
				throw error;
			}
		}
		// 从 D1 重读完整资料，不能用可能过期的 KV 快照补齐未提交字段。
		const profile = await getUserProfile(c.env.DB, session.userId);
		if (!profile) return errorResponse("用户资料不可用", 404);
		const { id: _id, ...fields } = profile;
		const merged = { ...session, ...fields };
		await putSession(c.env, merged);
		return c.json({ session: merged });
	});
}
