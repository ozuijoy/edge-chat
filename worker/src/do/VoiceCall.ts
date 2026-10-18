import { parseVerifiedUserId } from '../verified-identity.js';
import { notifyUserInbox, updateCallLease } from '../do-bridge.js';
import { durableObjectHealth } from '../maintenance/do-health.ts';
import { errorResponse } from '../utils.js';
import { ApiError } from '../errors.js';
import { authorizeVoiceCall } from '../calls/access.ts';
import { generateCallIceServers, turnConfigured } from '../calls/turn.ts';
import { callExpired, nextCallState, type CallState } from '../calls/state.ts';
import { CALL_RING_MS, CALL_MAX_MS, CALL_HEARTBEAT_MS, type CallAction } from '../../../shared/voice-call.ts';

export class VoiceCall {
  call: CallState | null = null;
  queue: Promise<unknown> = Promise.resolve();
  state;
  env;
  loaded = false;
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async load() {
    if (this.loaded) return;
    this.call = await this.state.storage.get('call') || null;
    this.loaded = true;
  }
  // 外部投递会 await；串行化整个动作，避免接听和取消在这些 I/O 间交错。
  serial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => {});
    return next;
  }
  async emit(call: CallState, type: string, extra = {}, target?: number) {
    const payload = { type, callId: call.id, roomId: call.roomId, callerId: call.callerId,
      calleeId: call.calleeId, callerClient: call.callerClient, calleeClient: call.calleeClient,
      mode: call.mode, revision: call.revision, expiresAt: call.createdAt + CALL_RING_MS, ...extra };
    await Promise.all((target ? [target] : [call.callerId, call.calleeId]).map(id => notifyUserInbox(this.env, id, payload)));
  }
  async end(reason: string) {
    const call = this.call;
    this.call = null;
    await this.state.storage.delete(['call', 'callerIce', 'calleeIce']);
    await this.state.storage.deleteAlarm();
    if (call) {
      await Promise.all([call.callerId, call.calleeId].map(id => updateCallLease(this.env, id, { callId: call.id }, true)));
      await this.emit(call, 'call_ended', { reason });
    }
  }
  async fetch(request) {
    const health = durableObjectHealth(request, 'VoiceCall');
    if (health) return health;
    return this.serial(async () => {
      try {
        await this.load();
        const userId = parseVerifiedUserId(request);
        if (!userId) return errorResponse('未登录', 401);
        const url = new URL(request.url);
        const roomId = Number(url.searchParams.get('roomId'));
        const access = await authorizeVoiceCall(this.env.DB, roomId, userId);
        if (this.call && callExpired(this.call, Date.now())) await this.end(this.call.phase === 'accepted' && Date.now() >= this.call.createdAt + CALL_MAX_MS ? 'limit' : 'timeout');
        if (url.pathname === '/ice') {
          if (!this.call || this.call.id !== url.searchParams.get('callId') || this.call.phase !== 'accepted') return errorResponse('通话已结束', 410);
          const client = userId === this.call.callerId ? this.call.callerClient : this.call.calleeClient;
          if (client !== url.searchParams.get('clientId')) return errorResponse('通话已被其他窗口接听', 409);
          const key = userId === this.call.callerId ? 'callerIce' : 'calleeIce';
          let ice = await this.state.storage.get(key);
          if (!ice) {
            ice = await generateCallIceServers(this.env);
            await this.state.storage.put(key, ice);
          }
          return Response.json(ice, { headers: { 'Cache-Control': 'no-store' } });
        }
        let action: CallAction;
        try { action = await request.json(); } catch { return errorResponse('无效的通话请求', 400); }
        if (!action || typeof action !== 'object') return errorResponse('无效的通话请求', 400);
        if (['start', 'accept', 'restart'].includes(action.type) && action.mode === 'relay' && !turnConfigured(this.env)) return errorResponse('TURN 尚未配置', 503);
        const previous = this.call;
        const next = nextCallState(previous, action, userId, access.peerId, roomId, Date.now());
        if (!next) { await this.end(action.type === 'reject' ? 'rejected' : 'hangup'); return Response.json({ ok: true }); }
        if (['start', 'accept', 'heartbeat'].includes(action.type)) {
          const expiresAt = next.phase === 'ringing' ? next.createdAt + CALL_RING_MS
            : Math.min(next.createdAt + CALL_MAX_MS, Math.min(next.callerSeen, next.calleeSeen) + CALL_HEARTBEAT_MS);
          const lease = { callId: next.id, roomId, expiresAt };
          const claims = await Promise.all([next.callerId, next.calleeId].map(id => updateCallLease(this.env, id, lease)));
          if (claims.some(response => !response.ok)) {
            await Promise.all([next.callerId, next.calleeId].map(id => updateCallLease(this.env, id, { callId: next.id }, true)));
            if (previous) await this.end('unavailable');
            return errorResponse('对方正在通话', 409);
          }
        }
        this.call = next;
        if (next !== previous) {
          await this.state.storage.put('call', next);
          await this.state.storage.setAlarm(next.phase === 'ringing' ? next.createdAt + CALL_RING_MS : Math.min(next.createdAt + CALL_MAX_MS, Date.now() + 35_000));
        }
        if (action.type === 'start') await this.emit(next, 'call_invite', { users: access.users });
        else if (action.type === 'accept' || action.type === 'restart') {
          if (next !== previous) await this.emit(next, 'call_negotiate');
        }
        else if (action.type !== 'heartbeat') {
          const signal = action.type === 'ice'
            ? { type: 'ice', candidate: { candidate: action.candidate.candidate, sdpMid: action.candidate.sdpMid, sdpMLineIndex: action.candidate.sdpMLineIndex, usernameFragment: action.candidate.usernameFragment } }
            : { type: action.type, sdp: action.sdp };
          await this.emit(next, 'call_signal', { signal }, userId === next.callerId ? next.calleeId : next.callerId);
        }
        return Response.json({ ok: true, call: next });
      } catch (error) {
        if (error instanceof ApiError) return errorResponse(error.message, error.status);
        console.error('voice call action failed');
        return errorResponse('通话暂时不可用', 503);
      }
    });
  }
  async alarm() {
    await this.serial(async () => {
      await this.load();
      if (!this.call) return;
      try { await authorizeVoiceCall(this.env.DB, this.call.roomId, this.call.callerId); }
      catch { await this.end('unavailable'); return; }
      if (callExpired(this.call, Date.now())) await this.end(this.call.phase === 'accepted' && Date.now() >= this.call.createdAt + CALL_MAX_MS ? 'limit' : 'timeout');
      else await this.state.storage.setAlarm(Math.min(this.call.createdAt + CALL_MAX_MS, Date.now() + 35_000));
    });
  }
}
