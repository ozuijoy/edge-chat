import { decryptMessageContent } from "../../encryption.js";
import { createInternalHeaders } from "../../verified-identity.js";
import { isLocalBridgeMessage } from "../bridge-policy.ts";
import { expireInvites } from "./lifecycle.ts";
import { sendEnvelope, type Envelope } from "./protocol.ts";
import {
  bindingSecret, invitationSecret, first, getBinding, identity, ownEndpoint, peerEndpoint,
  type BridgeEnv, type Binding,
} from "./store.ts";

export const backoff = (attempt: number) => Math.min(3_600_000, 30_000 * 2 ** Math.min(attempt, 7));
type OutboxItem = {
  event_id: string; message_id: number; sender_id: number; sender_name: string;
  content: string; created_at: number; target_revision: number; attempts: number;
};

function envelope(binding: Binding, instance: Awaited<ReturnType<typeof identity>>, type: Envelope["type"],
  data: Record<string, unknown>): Envelope {
  return { v: 1, type, bindingId: binding.id, from: ownEndpoint(instance, binding), to: peerEndpoint(binding),
    sentAt: Date.now(), nonce: crypto.randomUUID(), data };
}

function failureCode(error: unknown) {
  const code = (error as { code?: string })?.code;
  const allowed = ["invalid_peer_response", "binding_revoked", "binding_not_active", "not_receiving",
    "invitation_expired", "invitation_consumed", "wrong_binding", "wrong_target", "unsafe_address",
    "invalid_or_expired_message", "dns_unavailable"];
  return code && allowed.includes(code) ? code : "network_unavailable";
}

export async function deliverBinding(env: BridgeEnv, id: string, send = sendEnvelope) {
  let binding = await getBinding(env, id);
  if (!binding?.secret) return;
  const instance = await identity(env);
  const secret = await bindingSecret(env, binding);
  if (binding.control_pending && binding.control_next_at <= Date.now()) {
    const revision = binding.revision;
    const type = binding.status === "claiming" ? "claim" : binding.status === "activating" ? "activate" : "state";
    try {
      // 控制领取也有租约；DO/cron 同时唤醒或进程退出不会无限重复启动。
      const claimed = await env.DB.prepare(`UPDATE instance_bindings SET control_next_at = ?
        WHERE id = ? AND revision = ? AND control_pending = 1 AND control_next_at <= ?`)
        .bind(Date.now() + 30_000, id, revision, Date.now()).run();
      if (!claimed.meta.changes) return;
      await send(type === "claim" ? await invitationSecret(env, binding) : secret, envelope(binding, instance, type, {
        claimId: binding.claim_id, revision, paused: Boolean(binding.local_paused), revoked: binding.status === "revoked",
        ...(type === "claim" ? { credential: secret } : {}),
      }));
      await env.DB.prepare(`UPDATE instance_bindings SET control_pending = 0, control_attempts = 0,
        status = CASE WHEN status = 'claiming' THEN 'pending' WHEN status = 'activating' THEN 'active' ELSE status END,
        last_error = NULL
        WHERE id = ? AND revision = ? AND status = ?`)
        .bind(id, revision, binding.status).run();
    } catch (error) {
      await env.DB.prepare(`UPDATE instance_bindings SET control_attempts = control_attempts + 1,
        control_next_at = ?, last_error = ? WHERE id = ? AND revision = ?`)
        .bind(Date.now() + backoff(binding.control_attempts), failureCode(error), id, revision).run();
      return;
    }
  }
  binding = await getBinding(env, id);
  if (!binding || binding.status !== "active" || binding.local_paused || binding.peer_paused) return;
  for (let i = 0; i < 10; i++) {
    const item = await first<OutboxItem>(env.DB, `SELECT * FROM bridge_outbox WHERE binding_id = ?
      AND next_at <= ? AND expires_at > ? ORDER BY created_at, message_id LIMIT 1`, id, Date.now(), Date.now());
    if (!item) break;
    // 原子领取定义任务启动点；暂停/解绑发生在领取之后的请求属于在途，不承诺远端回滚。
    const claimed = await env.DB.prepare(`UPDATE bridge_outbox SET next_at = ?, attempts = attempts + 1
      WHERE binding_id = ? AND event_id = ? AND next_at <= ?
      AND EXISTS (SELECT 1 FROM instance_bindings WHERE id = ? AND status = 'active'
        AND local_paused = 0 AND peer_paused = 0)`)
      .bind(Date.now() + 30_000, id, item.event_id, Date.now(), id).run();
    if (!claimed.meta.changes) break;
    try {
      const content = await decryptMessageContent(env, item.content, { channelId: binding.channel_id, senderId: item.sender_id });
      await send(secret, envelope(binding, instance, "message", {
        eventId: item.event_id, createdAt: item.created_at, targetRevision: item.target_revision,
        senderId: String(item.sender_id), senderName: item.sender_name, content,
      }));
      await env.DB.batch([
        env.DB.prepare("DELETE FROM bridge_outbox WHERE binding_id = ? AND event_id = ?").bind(id, item.event_id),
        env.DB.prepare("UPDATE instance_bindings SET delivered_count = delivered_count + 1, last_error = NULL WHERE id = ?").bind(id),
      ]);
    } catch (error) {
      const code = failureCode(error);
      // 明确的暂停/过期拒绝不可在恢复后补发；网络故障与激活确认丢失仍可重试。
      if (["not_receiving", "binding_revoked", "invalid_or_expired_message"].includes(code)) {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM bridge_outbox WHERE binding_id = ? AND event_id = ?").bind(id, item.event_id),
          env.DB.prepare("UPDATE instance_bindings SET discarded_count = discarded_count + 1, last_error = ? WHERE id = ?").bind(code, id),
        ]);
      } else {
        await env.DB.batch([
          env.DB.prepare("UPDATE bridge_outbox SET next_at = ? WHERE binding_id = ? AND event_id = ?")
            .bind(Date.now() + backoff(item.attempts), id, item.event_id),
          env.DB.prepare("UPDATE instance_bindings SET last_error = ? WHERE id = ?").bind(code, id),
        ]);
        break;
      }
    }
  }
}

export async function nextDeliveryAt(env: BridgeEnv, id: string) {
  const row = await first<{ at: number | null }>(env.DB, `SELECT MIN(at) AS at FROM (
    SELECT control_next_at AS at FROM instance_bindings WHERE id = ? AND control_pending = 1 AND secret != ''
    UNION ALL SELECT next_at AS at FROM bridge_outbox WHERE binding_id = ? AND expires_at > ?
      AND EXISTS (SELECT 1 FROM instance_bindings WHERE id = ? AND status = 'active' AND local_paused = 0 AND peer_paused = 0)
  )`, id, id, Date.now(), id);
  return row?.at ?? null;
}

export async function wakeBinding(env: BridgeEnv, id: string) {
  if (!env.INSTANCE_BRIDGE) return;
  const stub = env.INSTANCE_BRIDGE.get(env.INSTANCE_BRIDGE.idFromName(id));
  const response = await stub.fetch("https://instance-bridge/wake", {
    method: "POST", headers: createInternalHeaders(), body: JSON.stringify({ id }),
  });
  if (!response.ok) throw new Error("Bridge wake failed");
}

export async function wakeForMessage(env: BridgeEnv, room: { id: number },
  message: Parameters<typeof isLocalBridgeMessage>[0] & { attachment?: unknown }) {
  if (!isLocalBridgeMessage(message) || message.attachment || !env.INSTANCE_BRIDGE) return;
  try {
    const binding = await first<{ id: string }>(env.DB, "SELECT id FROM instance_bindings WHERE channel_id = ? AND status = 'active'", room.id);
    if (binding) await wakeBinding(env, binding.id);
  } catch {
    // outbox 已由消息事务持久化，cron 会救援漏掉的唤醒，不能因此拒绝本站聊天。
    console.warn(JSON.stringify({ event: "instance_bridge_wake_failed", channelId: room.id }));
  }
}

export async function rescueBridgeDeliveries(env: BridgeEnv) {
  await expireInvites(env);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE instance_bindings SET discarded_count = discarded_count +
      (SELECT COUNT(*) FROM bridge_outbox WHERE binding_id = instance_bindings.id AND rowid IN
        (SELECT rowid FROM bridge_outbox WHERE expires_at <= ? ORDER BY rowid LIMIT 1000)),
      last_error = 'message_expired' WHERE id IN (SELECT binding_id FROM bridge_outbox
        WHERE rowid IN (SELECT rowid FROM bridge_outbox WHERE expires_at <= ? ORDER BY rowid LIMIT 1000))`).bind(now, now),
    env.DB.prepare("DELETE FROM bridge_outbox WHERE rowid IN (SELECT rowid FROM bridge_outbox WHERE expires_at <= ? ORDER BY rowid LIMIT 1000)").bind(now),
    env.DB.prepare("UPDATE instance_bindings SET invitation_secret = '' WHERE expires_at <= ? AND invitation_secret != ''").bind(now),
    env.DB.prepare("DELETE FROM bridge_receipts WHERE rowid IN (SELECT rowid FROM bridge_receipts WHERE expires_at <= ? LIMIT 1000)").bind(now),
    env.DB.prepare("DELETE FROM instance_bindings WHERE id IN (SELECT id FROM instance_bindings WHERE status = 'revoked' AND updated_at < ? LIMIT 100)")
      .bind(now - 604_800_000),
  ]);
  const { results } = await env.DB.prepare(`SELECT id FROM (
    SELECT id FROM instance_bindings WHERE control_pending = 1 AND control_next_at <= ?
    UNION SELECT binding_id AS id FROM bridge_outbox WHERE next_at <= ?
  ) LIMIT 100`).bind(now, now).all<{ id: string }>();
  // 有界并发；每轮最多唤醒 100 个有待办的绑定，闲置绑定没有网络请求或 alarm。
  for (let i = 0; i < results.length; i += 10) {
    await Promise.all(results.slice(i, i + 10).map((row: { id: string }) => wakeBinding(env, row.id)));
  }
}
