import { isVerifiedInternalRequest, parseVerifiedUserId } from '../verified-identity.js';
import { durableObjectHealth } from '../maintenance/do-health.ts';
import { handleCallLease } from '../calls/lease.ts';
import { validateSession } from '../session.js';

export class UserInbox {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = new Set();

    for (const socket of this.state.getWebSockets()) {
      this.connections.add(socket);
    }
  }

  async broadcastCall(payload) {
    // SDP 含网络候选地址；旧会话被撤销后不能继续从常驻 Inbox 获取通话信令。
    for (const socket of this.connections) {
      const meta = socket.deserializeAttachment();
      if (!meta?.token) continue;
      const auth = await validateSession(this.env, meta.token);
      if (!auth?.ok || auth.session.userId !== meta.userId) {
        socket.close(4401, 'session_invalid');
        this.connections.delete(socket);
        continue;
      }
      try { socket.send(JSON.stringify(payload)); }
      catch { this.connections.delete(socket); }
    }
  }

  broadcast(packet) {
    for (const socket of this.connections) {
      try {
        socket.send(packet);
      } catch {
        this.connections.delete(socket);
      }
    }
  }

  async fetch(request) {
    const health = durableObjectHealth(request, 'UserInbox');
    if (health) return health;
    const lease = await handleCallLease(request, this.state.storage);
    if (lease) return lease;
    const url = new URL(request.url);

    if (url.pathname === '/connect') {
      const userId = parseVerifiedUserId(request);
      if (!userId) {
        return new Response('Unauthorized', { status: 401 });
      }

      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected websocket', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ userId, token: url.searchParams.get('token') || '' });
      this.connections.add(server);
      server.send(JSON.stringify({ protocolVersion: 1, type: 'ready' }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/notify' && request.method === 'POST') {
      if (!isVerifiedInternalRequest(request)) {
        return new Response('Unauthorized', { status: 401 });
      }

      const payload = await request.json();
      if (payload.type?.startsWith('call_')) await this.broadcastCall(payload);
      else this.broadcast(JSON.stringify(payload));
      return Response.json({ ok: true });
    }

    return new Response('Not Found', { status: 404 });
  }

  webSocketClose(ws) {
    this.connections.delete(ws);
  }

  webSocketError(ws) {
    this.connections.delete(ws);
  }
}
