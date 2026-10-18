export type CallMode = 'auto' | 'relay';
export interface CallAction {
  type: string; callId: string; clientId: string; mode?: CallMode;
  revision?: number; sdp?: string;
  candidate?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null };
}
export const CALL_RING_MS = 45_000;
export const CALL_MAX_MS = 3_600_000;
export const CALL_HEARTBEAT_MS = 75_000;
export const CALL_STUN = [{ urls: 'stun:stun.cloudflare.com:3478' }];

export function validCallId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
}

export function validCallMode(value: unknown): value is CallMode {
  return value === 'auto' || value === 'relay';
}
