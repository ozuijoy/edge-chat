import { randomToken } from "../../utils.js";
import { bridgeError, INVITE_TTL, validId, validateEndpoint, type Endpoint } from "./protocol.ts";
import {
  type BridgeEnv, type Binding, identity, managedGroup, encryptBindingSecret, encryptInvitationSecret,
  bindingSecret, first, getBinding,
} from "./store.ts";

type Session = { userId: number };
type Invite = { v: 1; bindingId: string; endpoint: Endpoint; secret: string; expiresAt: number };

export async function createInvite(env: BridgeEnv, session: Session, channelId: number, origin: string) {
  const group = await managedGroup(env, session, channelId);
  const instance = await identity(env, origin);
  const id = crypto.randomUUID();
  const secret = randomToken(32);
  const expiresAt = Date.now() + INVITE_TTL;
  await expireInvites(env);
  try {
    await env.DB.prepare(`INSERT INTO instance_bindings
      (id, channel_id, channel_name, role, status, secret, invitation_secret, expires_at, created_by)
      VALUES (?, ?, ?, 'inviter', 'invited', '', ?, ?, ?)`)
      .bind(id, group.id, group.name, await encryptInvitationSecret(env, id, secret), expiresAt, session.userId).run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw bridgeError("group_already_bound", 409);
    throw error;
  }
  const invite: Invite = { v: 1, bindingId: id, secret, expiresAt,
    endpoint: { instanceId: instance.instance_id, origin: instance.origin, channelId: group.id, channelName: group.name } };
  // 剪贴板文本而非 URL，避免浏览器历史、Referer 与访问日志泄露一次性凭据。
  return { invitation: JSON.stringify(invite), expiresAt, id };
}

export async function acceptInvite(env: BridgeEnv, session: Session, channelId: number, text: string, origin: string) {
  const group = await managedGroup(env, session, channelId);
  let invite: Invite;
  try { invite = JSON.parse(text); } catch { throw bridgeError("invalid_invitation"); }
  if (!invite || invite.v !== 1 || !validId(invite.bindingId) || typeof invite.secret !== "string"
    || !/^[a-zA-Z0-9_-]{40,64}$/.test(invite.secret) || !Number.isSafeInteger(invite.expiresAt)
    || invite.expiresAt <= Date.now() || invite.expiresAt > Date.now() + INVITE_TTL + 300_000) {
    throw bridgeError("invalid_or_expired_invitation");
  }
  validateEndpoint(invite.endpoint);
  const instance = await identity(env, origin);
  if (instance.instance_id === invite.endpoint.instanceId || instance.origin === invite.endpoint.origin) {
    throw bridgeError("same_instance");
  }
  await expireInvites(env);
  const existing = await getBinding(env, invite.bindingId);
  if (existing && existing.channel_id === group.id && existing.role === "joiner"
    && existing.status !== "revoked" && existing.expires_at > Date.now()) return existing.id;
  try {
    await env.DB.prepare(`INSERT INTO instance_bindings
      (id, channel_id, channel_name, role, status, secret, invitation_secret, peer_instance_id, peer_origin,
       peer_channel_id, peer_channel_name, claim_id, expires_at, created_by, control_pending, peer_revision)
      VALUES (?, ?, ?, 'joiner', 'claiming', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`)
      .bind(invite.bindingId, group.id, group.name, await encryptBindingSecret(env, invite.bindingId, randomToken(32)),
        await encryptInvitationSecret(env, invite.bindingId, invite.secret),
        invite.endpoint.instanceId, invite.endpoint.origin, invite.endpoint.channelId, invite.endpoint.channelName,
        crypto.randomUUID(), invite.expiresAt, session.userId).run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw bridgeError("group_already_bound", 409);
    throw error;
  }
  return invite.bindingId;
}

export async function changeBinding(env: BridgeEnv, session: Session, id: string, action: string) {
  const binding = await getBinding(env, id);
  if (!binding) throw bridgeError("binding_not_found", 404);
  if (binding.status !== "revoked") await managedGroup(env, session, binding.channel_id);
  const now = Date.now();
  if (action === "confirm") {
    // 最终确认重新校验管理员与当前群，认领凭据不能代替发起方对具体目标的同意。
    const result = await env.DB.prepare(`UPDATE instance_bindings SET status = 'activating',
      revision = revision + 1, control_pending = 1, control_next_at = 0, control_attempts = 0, updated_at = ?
      WHERE id = ? AND role = 'inviter' AND status = 'pending' AND expires_at > ?`)
      .bind(now, id, now).run();
    if (!result.meta.changes) throw bridgeError("confirmation_unavailable", 409);
  } else if (action === "pause" || action === "resume" || action === "unlink") {
    if (binding.status === "revoked") return;
    if (action !== "unlink" && binding.status !== "active") throw bridgeError("binding_not_active", 409);
    await env.DB.batch([
      env.DB.prepare(`UPDATE instance_bindings SET
        status = CASE WHEN ? = 'unlink' THEN 'revoked' ELSE status END,
        local_paused = CASE WHEN ? = 'pause' THEN 1 ELSE 0 END,
        revision = revision + 1, control_pending = (peer_origin IS NOT NULL),
        control_next_at = 0, control_attempts = 0, updated_at = ?
        WHERE id = ? AND status != 'revoked'`).bind(action, action, now, id),
      env.DB.prepare("DELETE FROM bridge_outbox WHERE binding_id = ?").bind(id),
    ]);
  } else if (action === "retry") {
    await env.DB.batch([
      env.DB.prepare("UPDATE instance_bindings SET control_next_at = 0, control_attempts = 0 WHERE id = ?").bind(id),
      env.DB.prepare("UPDATE bridge_outbox SET next_at = 0 WHERE binding_id = ? AND expires_at > ?").bind(id, now),
    ]);
  } else throw bridgeError("invalid_action");
}

export async function expireInvites(env: BridgeEnv) {
  const now = Date.now();
  await env.DB.prepare(`UPDATE instance_bindings SET status = 'revoked',
    secret = CASE WHEN peer_origin IS NULL THEN '' ELSE secret END, invitation_secret = '',
    revision = revision + CASE WHEN peer_origin IS NULL THEN 0 ELSE 1 END,
    control_pending = CASE WHEN peer_origin IS NOT NULL AND secret != '' THEN 1 ELSE 0 END,
    control_next_at = 0, control_attempts = 0, last_error = 'invitation_expired', updated_at = ?
    WHERE id IN (SELECT id FROM instance_bindings WHERE status IN ('invited', 'claiming', 'pending')
      AND expires_at <= ? LIMIT 100)`).bind(now, now).run();
}

export async function receiveClaim(env: BridgeEnv, binding: Binding, from: Endpoint, claimId: unknown, credential: unknown) {
  if (binding.role !== "inviter" || !validId(claimId) || binding.expires_at <= Date.now()) throw bridgeError("invitation_expired", 410);
  if (typeof credential !== "string" || !/^[a-zA-Z0-9_-]{40,64}$/.test(credential)) throw bridgeError("invalid_credential");
  if (from.origin === (await identity(env)).origin) throw bridgeError("same_instance");
  const existingClaim = binding.claim_id;
  if (existingClaim && (existingClaim !== claimId || binding.peer_instance_id !== from.instanceId
    || binding.peer_origin !== from.origin || binding.peer_channel_id !== from.channelId
    || await bindingSecret(env, binding) !== credential)) {
    throw bridgeError("invitation_consumed", 409);
  }
  if (!["invited", "pending", "activating", "active"].includes(binding.status)) throw bridgeError("binding_revoked", 410);
  await env.DB.prepare(`UPDATE instance_bindings SET status = 'pending', peer_instance_id = ?, peer_origin = ?,
    peer_channel_id = ?, peer_channel_name = ?, claim_id = ?, updated_at = ?, peer_revision = 0, secret = ?
    WHERE id = ? AND status = 'invited' AND claim_id IS NULL AND expires_at > ?`)
    .bind(from.instanceId, from.origin, from.channelId, from.channelName, claimId, Date.now(),
      await encryptBindingSecret(env, binding.id, credential), binding.id, Date.now()).run();
  const current = await getBinding(env, binding.id);
  if (current?.claim_id !== claimId) throw bridgeError("invitation_consumed", 409);
}

export async function receiveControl(env: BridgeEnv, binding: Binding, type: string, data: Record<string, unknown>) {
  if (!Number.isSafeInteger(data.revision) || Number(data.revision) < 0
    || typeof data.paused !== "boolean" || typeof data.revoked !== "boolean") throw bridgeError("invalid_control");
  if (type === "activate") {
    if (binding.role !== "joiner" || binding.claim_id !== data.claimId) throw bridgeError("wrong_binding", 403);
    if (["claiming", "pending"].includes(binding.status) && binding.expires_at <= Date.now()) throw bridgeError("invitation_expired", 410);
    if (["claiming", "pending"].includes(binding.status)) {
      await managedGroup(env, { userId: binding.created_by }, binding.channel_id);
    }
  }
  if (binding.status === "revoked") {
    if (data.revoked) return;
    throw bridgeError("binding_revoked", 410);
  }
  if (type === "state" && binding.status !== "active" && !data.revoked) throw bridgeError("binding_not_active", 409);
  // 同一个 revision 的重试只确认；不得重设水位而吞掉后来产生的新消息。
  if (Number(data.revision) <= binding.peer_revision) return;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE instance_bindings SET
      status = CASE WHEN ? THEN 'revoked' WHEN ? = 'activate' THEN 'active' ELSE status END,
      peer_paused = ?, peer_revision = ?,
      control_pending = CASE WHEN ? = 'activate' OR ? THEN 0 ELSE control_pending END,
      updated_at = ?
      WHERE id = ? AND status != 'revoked' AND peer_revision < ?`)
      .bind(data.revoked ? 1 : 0, type, data.paused ? 1 : 0, data.revision,
        type, data.revoked ? 1 : 0, now, binding.id, data.revision),
  ]);
}

export async function receiptExists(env: BridgeEnv, bindingId: string, eventId: string) {
  return Boolean(await first(env.DB, "SELECT 1 FROM bridge_receipts WHERE binding_id = ? AND event_id = ?", bindingId, eventId));
}
