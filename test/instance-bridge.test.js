import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import initSqlJs from "sql.js";
import { Hono } from "hono";
import { createD1Adapter } from "./support/d1.js";
import { createInvite, acceptInvite, changeBinding, expireInvites } from "../worker/src/integrations/instance-bridge/lifecycle.ts";
import { deliverBinding, rescueBridgeDeliveries, nextDeliveryAt } from "../worker/src/integrations/instance-bridge/delivery.ts";
import { getBinding, bindingSecret, identity, ownEndpoint, peerEndpoint } from "../worker/src/integrations/instance-bridge/store.ts";
import { sendEnvelope, sign, BRIDGE_PATH, normalizeOrigin, publicIp, validatePublicDns } from "../worker/src/integrations/instance-bridge/protocol.ts";
import { registerInstanceBridgePublicRoutes, registerInstanceBridgeRoutes } from "../worker/src/api/instance-bridge.ts";
import { insertMessageIdempotent, insertExternalMessage, listMessages } from "../worker/src/data/messages.js";
import { ChannelRoom } from "../worker/src/do/ChannelRoom.js";
import { ApiError } from "../worker/src/errors.js";
import { forwardEdgeChatMessageToTelegram } from "../worker/src/integrations/telegram/bridge.js";
import { hardDeleteChannel } from "../worker/src/data/channel-deletion.ts";
import { shouldRunDailyGc } from "../worker/src/index.js";

const SQL = await initSqlJs();
const admin = { userId: 1, isAdmin: true };

function instance(origin, byte = 1) {
  const db = new SQL.Database();
  db.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
  db.run(`INSERT INTO users (id, username, display_name, password_hash, password_salt, is_super_admin)
    VALUES (1, 'admin', '管理员', 'hash', 'salt', 1), (2, 'member', '成员', 'hash', 'salt', 0);
    INSERT INTO channels (id, name, kind, created_by) VALUES (2, '私有群', 'private', 1), (3, '私信', 'dm', 1);
    INSERT INTO channel_members (channel_id, user_id, role) VALUES (2, 1, 'owner');`);
  const promises = [];
  const env = {
    DB: createD1Adapter(db),
    EDGECHAT_ENCRYPTION_KEYRING: JSON.stringify({ activeKeyId: "test", keys: { test: Buffer.alloc(32, byte).toString("base64") } }),
    USER_INBOX: { idFromName: (s) => s, get: () => ({ fetch: async () => Response.json({ ok: true }) }) },
  };
  env.CHANNEL_ROOM = {
    idFromName: (s) => s,
    get: () => ({ fetch: async (url, init) => {
      const room = new ChannelRoom({ getWebSockets: () => [], waitUntil: (p) => promises.push(p) }, env);
      return room.fetch(new Request(url, init));
    } }),
  };
  const app = new Hono();
  registerInstanceBridgePublicRoutes(app);
  app.use("*", async (c, next) => { c.set("session", admin); await next(); });
  registerInstanceBridgeRoutes(app);
  app.onError((e, c) => c.json({ error: e instanceof ApiError ? e.message : "internal" }, e.status || 500));
  return { db, env, origin, app, promises,
    count(table) { return db.exec(`SELECT COUNT(*) FROM ${table}`)[0].values[0][0]; },
    async request(path, body) {
      return app.fetch(new Request(origin + path, { method: body ? "POST" : "GET",
        headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }), env,
      { waitUntil: (p) => promises.push(p), passThroughOnException() {} });
    },
  };
}

function network(...instances) {
  return (secret, envelope) => sendEnvelope(secret, envelope, {
    checkDns: async () => {},
    fetcher: async (url, init) => {
      const peer = instances.find((i) => url.startsWith(`${i.origin}/`));
      assert.ok(peer, "只能向绑定对端发请求");
      return peer.app.fetch(new Request(url, init), peer.env);
    },
  });
}

async function pair() {
  const a = instance("https://bridge-a.workers.dev", 1);
  const b = instance("https://bridge-b.workers.dev", 2);
  const invitation = await createInvite(a.env, admin, 2, a.origin);
  const id = await acceptInvite(b.env, admin, 2, invitation.invitation, b.origin);
  const send = network(a, b);
  await deliverBinding(b.env, id, send);
  assert.equal((await getBinding(a.env, id)).status, "pending");
  await changeBinding(a.env, admin, id, "confirm");
  await deliverBinding(a.env, id, send);
  assert.equal((await getBinding(a.env, id)).status, "active");
  assert.equal((await getBinding(b.env, id)).status, "active");
  return { a, b, id, send };
}

async function local(i, content = "原创文字", options = {}) {
  return insertMessageIdempotent(i.env, { channelId: 2, senderId: 1, content, ...options });
}
async function packet(i, id, type, data) {
  const b = await getBinding(i.env, id);
  return { v: 1, type, bindingId: id, from: ownEndpoint(await identity(i.env), b), to: peerEndpoint(b),
    sentAt: Date.now(), nonce: crypto.randomUUID(), data };
}

test("双管理员确认后双向纯文字同步，独立加密密钥且不创建远端账号", async () => {
  const { a, b, id, send } = await pair();
  await local(a, "**来自 A**");
  assert.equal(a.count("bridge_outbox"), 1);
  assert.equal(a.db.exec("SELECT content FROM bridge_outbox")[0].values[0][0].includes("来自 A"), false);
  await deliverBinding(a.env, id, send);
  const received = (await listMessages(b.env, 2))[0];
  assert.equal(received.content, "**来自 A**");
  assert.equal(received.source, "instance-bridge");
  assert.equal(received.sender.kind, "external");
  assert.equal(received.sender.sourceInstance, a.origin);
  assert.equal(b.count("users"), 2);
  assert.equal(b.count("bridge_outbox"), 0);
  await local(b, "来自 B");
  await deliverBinding(b.env, id, send);
  assert.equal((await listMessages(a.env, 2)).at(-1).content, "来自 B");
});

test("对方已保存但 ACK 丢失，重试及并发重复请求只落一条消息", async () => {
  const { a, b, id, send } = await pair();
  await local(a);
  let sent;
  await deliverBinding(a.env, id, async (secret, envelope) => { sent = envelope; await send(secret, envelope); throw new Error("lost ack"); });
  assert.equal(b.count("messages"), 1);
  assert.equal(a.count("bridge_outbox"), 1);
  await changeBinding(a.env, admin, id, "retry");
  await deliverBinding(a.env, id, send);
  assert.equal(b.count("messages"), 1);
  assert.equal(a.count("bridge_outbox"), 0);
  const secret = await bindingSecret(a.env, await getBinding(a.env, id));
  await Promise.all([send(secret, sent), send(secret, sent)]);
  assert.equal(b.count("messages"), 1);
});

test("删除已接收消息后 receipt 保留，旧投递不能复活消息", async () => {
  const { a, b, id, send } = await pair();
  await local(a);
  let sent;
  await deliverBinding(a.env, id, async (secret, envelope) => { sent = envelope; return send(secret, envelope); });
  b.db.run("DELETE FROM messages");
  assert.equal(b.count("bridge_receipts"), 1);
  await send(await bindingSecret(a.env, await getBinding(a.env, id)), sent);
  assert.equal(b.count("messages"), 0);
});

test("离线不影响本站落库；退避持久化、恢复后按需重试", async () => {
  const { a, b, id, send } = await pair();
  await local(a);
  const now = Date.now();
  await deliverBinding(a.env, id, async () => { throw new Error("offline"); });
  assert.equal(a.count("messages"), 1);
  assert.ok(await nextDeliveryAt(a.env, id) > now);
  assert.equal((await getBinding(a.env, id)).last_error, "network_unavailable");
  await changeBinding(a.env, admin, id, "retry");
  await deliverBinding(a.env, id, send);
  assert.equal(b.count("messages"), 1);
});

test("暂停取消积压、恢复不补发；对端未获知暂停前的在途数据也不能在恢复后进入", async () => {
  const { a, b, id, send } = await pair();
  await local(a, "积压");
  await local(b, "旧对端");
  let old;
  await deliverBinding(b.env, id, async (_secret, envelope) => { old = envelope; throw new Error("offline"); });
  await changeBinding(a.env, admin, id, "pause");
  assert.equal(a.count("bridge_outbox"), 0);
  await local(a, "暂停时");
  assert.equal(a.count("bridge_outbox"), 0);
  await changeBinding(a.env, admin, id, "resume");
  const secret = await bindingSecret(b.env, await getBinding(b.env, id));
  await assert.rejects(send(secret, old), /not_receiving/);
  await deliverBinding(a.env, id, send);
  assert.equal(b.count("bridge_outbox"), 0);
  await local(b, "恢复后新消息");
  await deliverBinding(b.env, id, send);
  assert.equal((await listMessages(a.env, 2)).at(-1).content, "恢复后新消息");
});

test("双端独立暂停开关；重复控制不能清空后来的新消息", async () => {
  const { a, b, id, send } = await pair();
  await changeBinding(a.env, admin, id, "pause");
  let control;
  await deliverBinding(a.env, id, async (secret, envelope) => { control = envelope; return send(secret, envelope); });
  await changeBinding(b.env, admin, id, "pause");
  await deliverBinding(b.env, id, send);
  await changeBinding(a.env, admin, id, "resume");
  await deliverBinding(a.env, id, send);
  await local(a);
  assert.equal(a.count("bridge_outbox"), 0);
  await changeBinding(b.env, admin, id, "resume");
  await deliverBinding(b.env, id, send);
  await local(b, "不会被旧控制删除");
  await send(await bindingSecret(a.env, await getBinding(a.env, id)), control);
  assert.equal(b.count("bridge_outbox"), 1);
});

test("解绑与群组硬删除撤销接收并取消出站，保留最小通知墓碑", async () => {
  const { a, b, id, send } = await pair();
  await local(a);
  await changeBinding(a.env, admin, id, "unlink");
  assert.equal(a.count("bridge_outbox"), 0);
  await deliverBinding(a.env, id, send);
  assert.equal((await getBinding(b.env, id)).status, "revoked");
  const next = await createInvite(a.env, admin, 2, a.origin);
  assert.notEqual(next.id, id);
  await hardDeleteChannel(a.env.DB, 2);
  assert.equal((await getBinding(a.env, next.id)).status, "revoked");
  assert.deepEqual(a.db.exec("PRAGMA foreign_key_check"), []);
});

test("公开/私有/general 可邀请，DM/非管理员/重复群被拒绝，邀请一次认领", async () => {
  const a = instance("https://one.workers.dev");
  const b = instance("https://two.workers.dev");
  const c = instance("https://three.workers.dev");
  await createInvite(a.env, admin, 1, a.origin);
  await assert.rejects(createInvite(a.env, admin, 3, a.origin), /group_unavailable/);
  await assert.rejects(createInvite(a.env, { userId: 2 }, 2, a.origin), /admin_required/);
  const invite = await createInvite(a.env, admin, 2, a.origin);
  await assert.rejects(createInvite(a.env, admin, 2, a.origin), /group_already_bound/);
  const id = await acceptInvite(b.env, admin, 2, invite.invitation, b.origin);
  await deliverBinding(b.env, id, network(a, b));
  await acceptInvite(c.env, admin, 2, invite.invitation, c.origin);
  await deliverBinding(c.env, id, network(a, c));
  assert.equal((await getBinding(c.env, id)).last_error, "invitation_consumed");
  assert.equal((await getBinding(a.env, id)).peer_origin, b.origin);
});

test("伪造签名、错误目标群、过期信封不能接收；管理 API 不向成员泄露私有关系", async () => {
  const { a, b, id, send } = await pair();
  const message = await packet(a, id, "message", {
    eventId: crypto.randomUUID(), createdAt: Date.now(), senderId: "1", senderName: "a", content: "x", targetRevision: 0,
  });
  const raw = JSON.stringify(message);
  const bad = await b.app.fetch(new Request(b.origin + BRIDGE_PATH, { method: "POST", body: raw,
    headers: { "x-edgechat-signature": await sign("wrong", raw) } }), b.env);
  assert.equal(bad.status, 401);
  const secret = await bindingSecret(a.env, await getBinding(a.env, id));
  await assert.rejects(send(secret, { ...message, to: { ...message.to, channelId: 1 } }), /wrong_target/);
  const expired = { ...message, sentAt: Date.now() - 600_000 };
  const response = await b.app.fetch(new Request(b.origin + BRIDGE_PATH, { method: "POST", body: JSON.stringify(expired) }), b.env);
  assert.equal(response.status, 401);
  assert.equal(b.count("messages"), 0);
});

test("跨桥不扩散 Telegram/其他外部消息，带附件整条排除；回复仅正文", async () => {
  const { a, b, id, send } = await pair();
  await insertExternalMessage(a.env, { channelId: 2, content: "Telegram 入站", source: "telegram",
    sourceMessageId: "-1:123", externalSender: { id: "123", displayName: "TG" } });
  assert.equal(a.count("bridge_outbox"), 0);
  const deniedEnv = { get DB() { throw new Error("不得读取 Telegram 配置"); } };
  for (const source of ["telegram", "instance-bridge", "unknown"]) {
    await forwardEdgeChatMessageToTelegram(deniedEnv, { room: { id: 2, kind: "private" }, message: { source, sender: { kind: "external" } } });
  }
  a.db.run("INSERT INTO uploaded_files (object_key, owner_user_id) VALUES ('1/doc', 1)");
  await local(a, "附件说明", { attachment: { key: "1/doc", name: "doc", type: "text/plain", size: 1 } });
  assert.equal(a.count("bridge_outbox"), 0);
  const original = (await listMessages(a.env, 2))[0];
  await local(a, "回复的正文", { replyToMessageId: original.id });
  await deliverBinding(a.env, id, send);
  const remote = (await listMessages(b.env, 2))[0];
  assert.equal(remote.content, "回复的正文");
  assert.equal(remote.replyTo, undefined);
});

test("HTTPS 地址/DNS/重定向防护与无签名成功响应拒绝", async () => {
  for (const origin of ["http://a.com", "https://127.0.0.1", "https://localhost", "https://a.local",
    "https://user:pass@a.com", "https://a.com/x", "https://a.com:444", "https://[::1]", "https://2130706433"]) {
    assert.throws(() => normalizeOrigin(origin), /invalid_origin/);
  }
  for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::ffff:127.0.0.1", "fc00::1"]) assert.equal(publicIp(ip), false);
  await assert.rejects(validatePublicDns("https://a.com", async () => Response.json({ Status: 0, Answer: [{ type: 1, data: "10.0.0.1" }] })), /unsafe_address/);
  const { a, id } = await pair();
  const p = await packet(a, id, "state", { revision: 2, paused: true, revoked: false });
  await assert.rejects(sendEnvelope("test", p, { checkDns: async () => {}, fetcher: async (_url, init) => {
    assert.equal(init.redirect, "error");
    return Response.json({ ok: true });
  } }), /invalid_peer_response/);
});

test("触发器强制积压上限；超限不阻塞聊天，过期清理不遗失失败计数", async () => {
  const { a, id } = await pair();
  a.db.run(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1001)
    INSERT INTO messages(channel_id,sender_id,content) SELECT 2,1,'x' FROM n`);
  assert.equal(a.count("bridge_outbox"), 1000);
  assert.equal(a.count("messages"), 1001);
  assert.equal((await getBinding(a.env, id)).discarded_count, 1);
  a.db.run("UPDATE bridge_outbox SET expires_at = 0");
  await rescueBridgeDeliveries(a.env);
  assert.equal(a.count("bridge_outbox"), 0);
  assert.equal((await getBinding(a.env, id)).discarded_count, 1001);
});

test("激活确认丢失期间对端新消息不会因恢复时间水位而永远丢弃", async () => {
  const a = instance("https://ack-a.workers.dev");
  const b = instance("https://ack-b.workers.dev", 2);
  const invite = await createInvite(a.env, admin, 2, a.origin);
  const id = await acceptInvite(b.env, admin, 2, invite.invitation, b.origin);
  const send = network(a, b);
  await deliverBinding(b.env, id, send);
  await changeBinding(a.env, admin, id, "confirm");
  await deliverBinding(a.env, id, async (s, p) => { await send(s, p); throw new Error("ack lost"); });
  await local(b, "激活窗口内的新消息");
  await deliverBinding(b.env, id, send);
  assert.equal(b.count("bridge_outbox"), 1);
  await changeBinding(a.env, admin, id, "retry");
  await deliverBinding(a.env, id, send);
  await changeBinding(b.env, admin, id, "retry");
  await deliverBinding(b.env, id, send);
  assert.equal(a.count("messages"), 1);
});

test("激活前不能用普通状态控制抢占 revision", async () => {
  const a = instance("https://state-a.workers.dev");
  const b = instance("https://state-b.workers.dev", 2);
  const invite = await createInvite(a.env, admin, 2, a.origin);
  const id = await acceptInvite(b.env, admin, 2, invite.invitation, b.origin);
  const send = network(a, b);
  await deliverBinding(b.env, id, send);
  const state = await packet(a, id, "state", { revision: 1, paused: false, revoked: false });
  await assert.rejects(send(await bindingSecret(a.env, await getBinding(a.env, id)), state), /binding_not_active/);
  assert.equal((await getBinding(b.env, id)).peer_revision, 0);
  await changeBinding(a.env, admin, id, "confirm");
  await deliverBinding(a.env, id, send);
  assert.equal((await getBinding(b.env, id)).status, "active");
});

test("已认领邀请过期会持久化通知对端撤销", async () => {
  const a = instance("https://expiry-a.workers.dev");
  const b = instance("https://expiry-b.workers.dev", 2);
  const invite = await createInvite(a.env, admin, 2, a.origin);
  const id = await acceptInvite(b.env, admin, 2, invite.invitation, b.origin);
  const send = network(a, b);
  await deliverBinding(b.env, id, send);
  a.db.run("UPDATE instance_bindings SET expires_at = 0 WHERE id = ?", [id]);
  await expireInvites(a.env);
  const expired = await getBinding(a.env, id);
  assert.equal(expired.status, "revoked");
  assert.equal(expired.control_pending, 1);
  assert.notEqual(expired.secret, "");
  await deliverBinding(a.env, id, send);
  assert.equal((await getBinding(b.env, id)).status, "revoked");
});

test("一次性邀请只可用于认领，长期凭据独立，持有旧邀请不能签署消息", async () => {
  const a = instance("https://keys-a.workers.dev");
  const b = instance("https://keys-b.workers.dev", 2);
  const invite = await createInvite(a.env, admin, 2, a.origin);
  const bootstrap = JSON.parse(invite.invitation).secret;
  const id = await acceptInvite(b.env, admin, 2, invite.invitation, b.origin);
  const send = network(a, b);
  await deliverBinding(b.env, id, send);
  await changeBinding(a.env, admin, id, "confirm");
  await deliverBinding(a.env, id, send);
  const longTerm = await bindingSecret(a.env, await getBinding(a.env, id));
  assert.notEqual(bootstrap, longTerm);
  const p = await packet(a, id, "state", { revision: 999, paused: true, revoked: false });
  await assert.rejects(send(bootstrap, p), /invalid_peer_response/);
  assert.equal((await getBinding(b.env, id)).peer_paused, 0);
});

test("接收校验后发生暂停，由 INSERT 事务门禁拒绝，发送方不能误认已保存", async () => {
  const { a, b, id, send } = await pair();
  const original = b.env.CHANNEL_ROOM.get;
  b.env.CHANNEL_ROOM.get = (...args) => {
    const stub = original(...args);
    return { fetch: async (...request) => {
      await changeBinding(b.env, admin, id, "pause");
      return stub.fetch(...request);
    } };
  };
  await local(a);
  await deliverBinding(a.env, id, send);
  assert.equal(b.count("messages"), 0);
  assert.equal(b.count("bridge_receipts"), 0);
  assert.equal((await getBinding(a.env, id)).delivered_count, 0);
});

test("消息事务回滚也回滚 outbox；接收事务失败也回滚 receipt", async () => {
  const { a, b, id, send } = await pair();
  a.db.run(`CREATE TRIGGER fail_local AFTER INSERT ON messages BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
  await assert.rejects(local(a), /test failure/);
  assert.equal(a.count("messages"), 0);
  assert.equal(a.count("bridge_outbox"), 0);
  a.db.run("DROP TRIGGER fail_local");
  await local(a);
  b.db.run(`CREATE TRIGGER fail_external AFTER INSERT ON messages BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
  await deliverBinding(a.env, id, send);
  assert.equal(b.count("messages"), 0);
  assert.equal(b.count("bridge_receipts"), 0);
  assert.equal(a.count("bridge_outbox"), 1);
});

test("旧库增量迁移与新安装一致，过期邀请释放占位且不能再认领", async () => {
  const schema = readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8");
  const db = new SQL.Database();
  const prior = schema.slice(0, schema.indexOf("CREATE TABLE IF NOT EXISTS bridge_instance"))
    .replace(/^ {2}(bridge_binding_id|bridge_event_id|bridge_sent_at|source_instance|bridge_target_revision) .+\r?\n/gm, "");
  db.exec(prior);
  db.exec(readFileSync(new URL("../worker/migrations/2026-09-19-instance-bridge.sql", import.meta.url), "utf8"));
  assert.deepEqual(db.exec("PRAGMA foreign_key_check"), []);
  const a = instance("https://expire-a.workers.dev");
  const old = await createInvite(a.env, admin, 2, a.origin);
  a.db.run("UPDATE instance_bindings SET expires_at = 0 WHERE id = ?", [old.id]);
  const next = await createInvite(a.env, admin, 2, a.origin);
  assert.notEqual(next.id, old.id);
  assert.equal((await getBinding(a.env, old.id)).status, "revoked");
  assert.equal((await getBinding(a.env, old.id)).invitation_secret, "");
});

test("非成员不能读取私有群绑定关系，伪造 session 管理员字段也不能写配置", async () => {
  const { a, id } = await pair();
  const app = new Hono();
  app.use("*", async (c, next) => { c.set("session", { userId: 2, isAdmin: false }); await next(); });
  registerInstanceBridgeRoutes(app);
  app.onError((e, c) => c.json({ error: e.message }, e.status || 500));
  assert.equal((await app.request("https://bridge-a.workers.dev/api/channels/2/instance-bridge", {}, a.env)).status, 403);
  assert.equal((await app.request(`https://bridge-a.workers.dev/api/admin/instance-bridge/${id}/actions`,
    { method: "POST", body: JSON.stringify({ action: "unlink" }) }, a.env)).status, 403);
  await assert.rejects(createInvite(a.env, { userId: 2, isAdmin: true }, 1, a.origin), /admin_required/);
});

test("单一 15 分钟 cron 在 UTC 19:00 轮次同时执行每日 GC", () => {
  const config = readFileSync(new URL("../wrangler.example.toml", import.meta.url), "utf8");
  assert.match(config, /crons = \["\*\/15 \* \* \* \*"\]/);
  assert.equal(shouldRunDailyGc(Date.UTC(2026, 8, 19, 19, 0)), true);
  assert.equal(shouldRunDailyGc(Date.UTC(2026, 8, 19, 18, 45)), false);
});
