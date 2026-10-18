import { isVerifiedInternalRequest } from '../verified-identity.js';

export function durableObjectHealth(request: Request, service: string): Response | null {
  if (new URL(request.url).pathname !== '/health') return null;
  if (!isVerifiedInternalRequest(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }
  // 健康請求只證明對象代碼可達；不接收連接、不讀寫業務狀態、更不啟動 alarm。
  return Response.json({ ok: true, service });
}
