import { CALL_HEARTBEAT_MS, CALL_MAX_MS, CALL_RING_MS, validCallId, validCallMode, type CallAction } from '../../../shared/voice-call.ts';
import { ApiError } from '../errors.js';

export interface CallState {
  id: string; roomId: number; callerId: number; calleeId: number;
  callerClient: string; calleeClient: string; mode: 'auto' | 'relay';
  phase: 'ringing' | 'accepted'; revision: number; createdAt: number;
  callerSeen: number; calleeSeen: number;
}

export function callExpired(call: CallState, now: number): boolean {
  return now >= call.createdAt + (call.phase === 'ringing' ? CALL_RING_MS : CALL_MAX_MS)
    || (call.phase === 'accepted' && Math.min(call.callerSeen, call.calleeSeen) + CALL_HEARTBEAT_MS <= now);
}

export function nextCallState(call: CallState | null, action: CallAction, userId: number, peerId: number, roomId: number, now: number): CallState | null {
  if (!validCallId(action.callId) || !validCallId(action.clientId)) throw new ApiError('無效的通話請求', 400);
  if (action.type === 'start') {
    if (!validCallMode(action.mode)) throw new ApiError('無效的連接方式', 400);
    if (call) throw new ApiError('對方正在通話', 409);
    return { id: action.callId, roomId, callerId: userId, calleeId: peerId,
      callerClient: action.clientId, calleeClient: '', mode: action.mode,
      phase: 'ringing', revision: 0, createdAt: now, callerSeen: now, calleeSeen: now } satisfies CallState;
  }
  if (!call || call.id !== action.callId) throw new ApiError('通話已結束', 410);
  const caller = userId === call.callerId;
  if (!caller && userId !== call.calleeId) throw new ApiError('僅私聊雙方可以通話', 403);
  if (action.type === 'accept' || action.type === 'reject') {
    if (caller || call.phase !== 'ringing') throw new ApiError('通話已被處理', 409);
    if (action.type === 'reject') return null;
    if (!validCallMode(action.mode)) throw new ApiError('無效的連接方式', 400);
    return { ...call, phase: 'accepted', calleeClient: action.clientId, revision: 1,
      mode: action.mode === 'relay' ? 'relay' : call.mode, callerSeen: now, calleeSeen: now } satisfies CallState;
  }
  if (action.clientId !== (caller ? call.callerClient : call.calleeClient)) throw new ApiError('通話已被其他窗口接聽', 409);
  if (action.type === 'hangup') return null;
  if (action.type === 'heartbeat') return { ...call, [caller ? 'callerSeen' : 'calleeSeen']: now };
  if (call.phase !== 'accepted') throw new ApiError('通話尚未接聽', 409);
  if (action.type === 'restart') {
    if (!validCallMode(action.mode)) throw new ApiError('無效的連接方式', 400);
    if (action.mode === call.mode) return call;
    return { ...call, mode: action.mode, revision: call.revision + 1 };
  }
  if (!['offer', 'answer', 'ice'].includes(action.type)) throw new ApiError('無效的通話請求', 400);
  if (action.revision !== call.revision) throw new ApiError('通話協商已更新', 409);
  if ((action.type === 'offer' && !caller) || (action.type === 'answer' && caller)) throw new ApiError('無效的通話信令', 403);
  if (action.type === 'ice') {
    if (!action.candidate || typeof action.candidate.candidate !== 'string' || action.candidate.candidate.length > 2048) throw new ApiError('無效的通話信令', 400);
  } else if (typeof action.sdp !== 'string' || action.sdp.length > 24_000 || !action.sdp.startsWith('v=0')) {
    throw new ApiError('無效的通話信令', 400);
  }
  return call;
}
