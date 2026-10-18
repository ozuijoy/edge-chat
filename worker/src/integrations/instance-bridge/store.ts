import { decryptSecretValue, encryptSecretValue } from "../../encryption.js";
import { authorizeChannelManagement, getChannelById } from "../../room-access.js";
import { readAuthorization, managedGroupScope } from '../../rbac/authorization.ts';
import { hasPermission } from '../../../../shared/admin-permissions.ts';
import { isUserDisabled } from "../../user-status.js";
import { bridgeError, normalizeOrigin, type Endpoint } from "./protocol.ts";

export interface Statement {
  bind(...args: unknown[]): Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}
export interface Namespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
}
// 保持与现有 JS Worker 的结构化接口兼容，不为桥接引入新的服务容器。
export type BridgeEnv = {
  DB: Database;
  INSTANCE_BRIDGE?: Namespace;
  CHANNEL_ROOM: Namespace;
  [key: string]: unknown;
};
export type Binding = {
  id: string; channel_id: number; channel_name: string;
  role: "inviter" | "joiner"; status: string; secret: string; invitation_secret: string;
  peer_instance_id: string; peer_origin: string; peer_channel_id: number; peer_channel_name: string;
  claim_id: string; expires_at: number; local_paused: number; peer_paused: number;
  revision: number; peer_revision: number; control_pending: number;
  control_attempts: number; control_next_at: number; created_at: number; updated_at: number;
  last_error: string | null; delivered_count: number; discarded_count: number; created_by: number;
};
export type Identity = { instance_id: string; origin: string };

export async function first<T = Record<string, unknown>>(db: Database, sql: string, ...args: unknown[]): Promise<T | null> {
  const { results } = await db.prepare(sql).bind(...args).all<T>();
  return results[0] || null;
}

export async function identity(env: BridgeEnv, requestOrigin?: string): Promise<Identity> {
  if (requestOrigin) {
    await env.DB.prepare("INSERT OR IGNORE INTO bridge_instance (singleton, instance_id, origin) VALUES (1, ?, ?)")
      .bind(crypto.randomUUID(), normalizeOrigin(requestOrigin)).run();
  }
  let instance = await first<Identity>(env.DB, "SELECT instance_id, origin FROM bridge_instance WHERE singleton = 1");
  if (!instance) throw bridgeError("not_configured", 409);
  if (requestOrigin && instance.origin !== normalizeOrigin(requestOrigin)) {
    // 无存活关系或未确认撤销通知时才允许换主域名，避免静默改变既有绑定的身份。
    await env.DB.prepare(`UPDATE bridge_instance SET origin = ? WHERE singleton = 1
      AND NOT EXISTS (SELECT 1 FROM instance_bindings WHERE status != 'revoked' OR control_pending = 1)`)
      .bind(normalizeOrigin(requestOrigin)).run();
    instance = await first<Identity>(env.DB, "SELECT instance_id, origin FROM bridge_instance WHERE singleton = 1");
    if (!instance || instance.origin !== normalizeOrigin(requestOrigin)) throw bridgeError("origin_mismatch", 409);
  }
  return instance;
}

export async function getBinding(env: BridgeEnv, id: string): Promise<Binding | null> {
  return first<Binding>(env.DB, "SELECT * FROM instance_bindings WHERE id = ?", id);
}

export function ownEndpoint(instance: Identity, binding: Binding): Endpoint {
  return { instanceId: instance.instance_id, origin: instance.origin,
    channelId: binding.channel_id || 0, channelName: binding.channel_name };
}
export function peerEndpoint(binding: Binding): Endpoint {
  return { instanceId: binding.peer_instance_id, origin: binding.peer_origin,
    channelId: binding.peer_channel_id, channelName: binding.peer_channel_name };
}
export function bindingSecret(env: BridgeEnv, binding: Binding) {
  return decryptSecretValue(env, binding.secret, `instance-bridge:${binding.id}`);
}
export function encryptBindingSecret(env: BridgeEnv, id: string, secret: string) {
  return encryptSecretValue(env, secret, `instance-bridge:${id}`);
}
export function invitationSecret(env: BridgeEnv, binding: Binding) {
  return decryptSecretValue(env, binding.invitation_secret, `instance-bridge-invitation:${binding.id}`);
}
export function encryptInvitationSecret(env: BridgeEnv, id: string, secret: string) {
  return encryptSecretValue(env, secret, `instance-bridge-invitation:${id}`);
}

export async function requireAdmin(env: BridgeEnv, session: { userId: number }, permission = 'instance_bridge.manage') {
  const user = await first(env.DB, "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", session.userId);
  if (!user || isUserDisabled(user)) throw bridgeError("admin_required", 403);
  const authorization = await readAuthorization(env.DB, session.userId);
  if (!hasPermission(authorization, permission)) throw bridgeError("admin_required", 403);
  return authorization;
}
export async function managedGroup(env: BridgeEnv, session: { userId: number }, channelId: number) {
  const authorization = await requireAdmin(env, session);
  // 超管保持原有全站桥接运维行为；子管理员必须拥有真实群主关系，不能制造全权聊天身份。
  if (authorization.isSuperAdmin) {
    const channel = await getChannelById(env.DB, channelId);
    if (!channel || !['public', 'private'].includes(channel.kind)) throw bridgeError('group_unavailable', 403);
    return channel;
  }
  const access = await authorizeChannelManagement(env.DB, session, channelId);
  if (!access.ok) throw bridgeError("group_unavailable", 403);
  return access.channel;
}

export function publicBinding(b: Binding & { queued?: number }) {
  return { id: b.id, channelId: b.channel_id, channelName: b.channel_name, role: b.role,
    status: b.status, peerOrigin: b.peer_origin, peerInstanceId: b.peer_instance_id,
    peerChannelId: b.peer_channel_id, peerChannelName: b.peer_channel_name,
    localPaused: Boolean(b.local_paused), peerPaused: Boolean(b.peer_paused),
    controlPending: Boolean(b.control_pending), expiresAt: b.expires_at,
    lastError: b.last_error, queued: Number(b.queued || 0),
    delivered: b.delivered_count, discarded: b.discarded_count };
}

export async function adminState(env: BridgeEnv, actor = { isSuperAdmin: true, userId: 0 }) {
  const scope = managedGroupScope(actor, 'b.channel_id');
  const channelScope = managedGroupScope(actor, 'channels.id');
  const [{ results: bindings }, { results: channels }] = await Promise.all([
    env.DB.prepare(`SELECT b.*, (SELECT COUNT(*) FROM bridge_outbox o WHERE o.binding_id = b.id) AS queued
      FROM instance_bindings b WHERE ${scope.sql} ORDER BY b.created_at DESC LIMIT 100`).bind(...scope.params).all<Binding & { queued: number }>(),
    env.DB.prepare(`SELECT id, name, kind FROM channels WHERE kind IN ('public', 'private') AND deleted_at IS NULL
      AND ${channelScope.sql} ORDER BY name LIMIT 100`).bind(...channelScope.params).all(),
  ]);
  return { instance: await first(env.DB, "SELECT instance_id AS id, origin FROM bridge_instance WHERE singleton = 1"),
    channels, bindings: bindings.map(publicBinding) };
}
