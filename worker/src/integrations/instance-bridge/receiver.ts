import { submitExternalRoomMessage } from "../../do-bridge.js";
import { ApiError } from "../../errors.js";
import {
  bridgeError, CLOCK_SKEW, MESSAGE_TTL, readLimitedText, signedResponse, validId,
  validateEnvelope, verify, type Envelope,
} from "./protocol.ts";
import { bindingSecret, invitationSecret, first, getBinding, identity, type BridgeEnv } from "./store.ts";
import { receiptExists, receiveClaim, receiveControl } from "./lifecycle.ts";

export async function receiveBridgeRequest(env: BridgeEnv, request: Request) {
  let envelope: Envelope;
  const raw = await readLimitedText(request);
  try { envelope = JSON.parse(raw); } catch { throw bridgeError("invalid_json"); }
  validateEnvelope(envelope);
  const binding = await getBinding(env, envelope.bindingId);
  if (!binding || !(envelope.type === "claim" ? binding.invitation_secret : binding.secret)) throw bridgeError("authentication_failed", 401);
  const secret = envelope.type === "claim" ? await invitationSecret(env, binding) : await bindingSecret(env, binding);
  if (!await verify(secret, raw, request.headers.get("x-edgechat-signature") || "")) {
    throw bridgeError("authentication_failed", 401);
  }
  try {
    const instance = await identity(env);
    if (envelope.to.instanceId !== instance.instance_id || envelope.to.origin !== instance.origin
      || envelope.to.channelId !== binding.channel_id
      || new URL(request.url).origin !== instance.origin) throw bridgeError("wrong_target", 403);
    if (envelope.type !== "claim" && (envelope.from.instanceId !== binding.peer_instance_id
      || envelope.from.origin !== binding.peer_origin || envelope.from.channelId !== binding.peer_channel_id)) {
      throw bridgeError("wrong_binding", 403);
    }
    if (envelope.type === "claim") {
      await receiveClaim(env, binding, envelope.from, envelope.data.claimId, envelope.data.credential);
    } else if (envelope.type === "activate" || envelope.type === "state") {
      await receiveControl(env, binding, envelope.type, envelope.data);
    } else {
      if (binding.status === "revoked") throw bridgeError("binding_revoked", 410);
      if (binding.status !== "active") throw bridgeError("binding_not_active", 409);
      const { eventId, createdAt, senderId, senderName, content, targetRevision } = envelope.data;
      if (!validId(eventId) || !Number.isSafeInteger(createdAt)
        || Number(createdAt) < Date.now() - MESSAGE_TTL || Number(createdAt) > Date.now() + CLOCK_SKEW
        || typeof senderId !== "string" || !/^[1-9]\d{0,15}$/.test(senderId)
        || typeof senderName !== "string" || !senderName.trim() || senderName.length > 100
        || typeof content !== "string" || !content.trim() || new TextEncoder().encode(content).length > 10_240) {
        throw bridgeError("invalid_or_expired_message", 422);
      }
      if (!await receiptExists(env, binding.id, eventId)) {
        if (binding.local_paused || binding.peer_paused || targetRevision !== binding.revision) {
          throw bridgeError("not_receiving", 409);
        }
        const room = await first<{ id: number; kind: string; name: string }>(
          env.DB, "SELECT id, kind, name FROM channels WHERE id = ? AND deleted_at IS NULL", binding.channel_id);
        if (!room) throw bridgeError("binding_revoked", 410);
        // 只注入协议允许的字段；不接受附件、回复、提及或任何本地用户 ID。
        const response = await submitExternalRoomMessage(env, {
          room,
          source: "instance-bridge", sourceMessageId: `${binding.id}:${eventId}`,
          externalSender: { id: `${binding.peer_instance_id}:${senderId}`, displayName: senderName, avatarUrl: "" },
          content, bridgeDelivery: { bindingId: binding.id, eventId, createdAt, targetRevision },
          sourceInstance: binding.peer_origin,
        });
        if (!response.ok) {
          if (response.status === 409) throw bridgeError("not_receiving", 409);
          throw bridgeError("internal_error", 500);
        }
      }
    }
    return signedResponse(secret, envelope.nonce, { ok: true });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return signedResponse(secret, envelope.nonce, { error: { code: error.code, message: error.message } }, error.status);
  }
}
