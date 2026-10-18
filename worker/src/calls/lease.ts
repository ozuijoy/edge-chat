import { isVerifiedInternalRequest } from '../verified-identity.js';

export async function handleCallLease(request, storage) {
  const path = new URL(request.url).pathname;
  if (!['/call-claim', '/call-release'].includes(path)) return null;
  if (request.method !== 'POST' || !isVerifiedInternalRequest(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const lease = await request.json();
  // 每个用户的 Inbox 是唯一协调点，跨私聊与多窗口也只能占用一个通话席位。
  const ok = await storage.transaction(async transaction => {
    const current = await transaction.get('callLease');
    if (path === '/call-release') {
      if (current?.callId === lease.callId) await transaction.delete('callLease');
      return true;
    }
    if (current && current.expiresAt > Date.now() && current.callId !== lease.callId) return false;
    await transaction.put('callLease', lease);
    return true;
  });
  return Response.json({ ok }, { status: ok ? 200 : 409 });
}
