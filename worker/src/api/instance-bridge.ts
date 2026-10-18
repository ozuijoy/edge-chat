import { ApiError } from "../errors.js";
import { authorizeRoom, getChannelById } from "../room-access.js";
import { createInvite, acceptInvite, changeBinding } from "../integrations/instance-bridge/lifecycle.ts";
import { adminState, first, publicBinding, requireAdmin } from "../integrations/instance-bridge/store.ts";
import { receiveBridgeRequest } from "../integrations/instance-bridge/receiver.ts";
import { BRIDGE_PATH, bridgeError, readLimitedText } from "../integrations/instance-bridge/protocol.ts";
import { wakeBinding } from "../integrations/instance-bridge/delivery.ts";
import type { Context, Hono } from "hono";
import type { Binding, BridgeEnv } from "../integrations/instance-bridge/store.ts";

type AppEnv = { Bindings: BridgeEnv; Variables: { session: { userId: number; isAdmin: boolean } } };

async function payload(c: Context<AppEnv>) {
  const raw = await readLimitedText(c.req.raw);
  try { return JSON.parse(raw); } catch { throw bridgeError("invalid_json"); }
}

export function registerInstanceBridgePublicRoutes(app: Hono<AppEnv>) {
  app.post(BRIDGE_PATH, async (c: Context<AppEnv>) => {
    try { return await receiveBridgeRequest(c.env, c.req.raw); }
    catch (error) {
      if (error instanceof ApiError) return c.json({ error: { code: error.code, message: error.message } }, error.status);
      console.error(JSON.stringify({ event: "instance_bridge_receive_failed" }));
      return c.json({ error: { code: "internal_error", message: "跨实例消息暂时无法接收" } }, 500);
    }
  });
}

export function registerInstanceBridgeRoutes(app: Hono<AppEnv>) {
  app.get("/api/channels/:id/instance-bridge", async (c: Context<AppEnv>) => {
    c.header("Cache-Control", "private, no-store");
    const group = await getChannelById(c.env.DB, Number(c.req.param("id")));
    if (!group || !await authorizeRoom(c.env.DB, c.get("session"), group.kind, group.id).then((r) => r.ok)) {
      throw bridgeError("group_unavailable", 403);
    }
    const binding = await first<Binding>(c.env.DB, "SELECT * FROM instance_bindings WHERE channel_id = ? AND status != 'revoked'", group.id);
    // 群成员仅获知已认领的关系，不暴露邀请凭据或对方任何成员资料。
    return c.json({ binding: binding?.peer_origin ? publicBinding(binding) : null });
  });
  app.use("/api/admin/instance-bridge/*", async (c: Context<AppEnv>, next: () => Promise<void>) => {
    c.header("Cache-Control", "private, no-store");
    await requireAdmin(c.env, c.get("session"), c.req.method === 'GET' ? 'instance_bridge.read' : 'instance_bridge.manage');
    await next();
  });
  app.get("/api/admin/instance-bridge", async (c: Context<AppEnv>) => {
    c.header("Cache-Control", "private, no-store");
    await requireAdmin(c.env, c.get("session"), 'instance_bridge.read');
    return c.json(await adminState(c.env, c.get('session')));
  });
  app.post("/api/admin/instance-bridge/invitations", async (c: Context<AppEnv>) => {
    const data = await payload(c);
    return c.json(await createInvite(c.env, c.get("session"), Number(data.channelId), new URL(c.req.url).origin));
  });
  app.post("/api/admin/instance-bridge/accept", async (c: Context<AppEnv>) => {
    const data = await payload(c);
    const id = await acceptInvite(c.env, c.get("session"), Number(data.channelId), String(data.invitation || ""), new URL(c.req.url).origin);
    c.executionCtx.waitUntil(wakeBinding(c.get('unrestrictedEnvironment'), id));
    return c.json({ id });
  });
  app.post("/api/admin/instance-bridge/:id/actions", async (c: Context<AppEnv>) => {
    const data = await payload(c);
    const id = c.req.param("id");
    await changeBinding(c.env, c.get("session"), id, data.action);
    c.executionCtx.waitUntil(wakeBinding(c.get('unrestrictedEnvironment'), id));
    return c.json(await adminState(c.env, c.get('session')));
  });
}
