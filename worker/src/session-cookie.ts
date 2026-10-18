import { SESSION_TTL_SECONDS } from './auth.js';

function cookieName(request: Request) {
  return new URL(request.url).protocol === 'https:' ? '__Host-session' : 'session';
}

export function cookieToken(request: Request) {
  const name = `${cookieName(request)}=`;
  return (request.headers.get('cookie') || '').split(';')
    .map((part) => part.trim()).find((part) => part.startsWith(name))?.slice(name.length) || '';
}

export function sessionCookie(request: Request, token: string) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_TTL_SECONDS : 0}${secure}`;
}

export function extractSessionToken(request: Request) {
  const header = request.headers.get('authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return new URL(request.url).searchParams.get('token') || cookieToken(request);
}

export function cookieRequestAllowed(request: Request) {
  // Bearer 调用仍兼容客户端；浏览器自动携带的 Cookie 必须单独防跨站写入和 WebSocket 劫持。
  if (request.headers.get('authorization')?.startsWith('Bearer ')
    || new URL(request.url).searchParams.get('token') || !cookieToken(request)) return true;
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    && request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return true;
  return request.headers.get('origin') === new URL(request.url).origin;
}
