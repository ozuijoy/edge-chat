import { getStealthSettings } from '../data/stealth-settings.ts';
import { validateSession } from '../session.js';
import { cookieRequestAllowed, extractSessionToken } from '../session-cookie.ts';
import { gatePage, notFound, privateHeaders, submitGate } from './gate.ts';
import { errorResponse, v1ErrorResponse } from '../utils.js';

function privateResponse(response: Response) {
  // WebSocket 101 不能重建為普通 Response，否則會丟失運行時 webSocket 句柄。
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(privateHeaders)) headers.set(key, value);
  for (const key of ['Server', 'X-Powered-By', 'ETag', 'Last-Modified', 'Link', 'Content-Length']) headers.delete(key);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function assets(request: Request, env, settings, authenticated?: boolean) {
  if (!env.ASSETS) return notFound();
  const response = await env.ASSETS.fetch(request);
  if (!response.headers.get('content-type')?.includes('text/html')) {
    return privateResponse(response);
  }
  // 關閉模式的腳本/圖片仍為公開資源，無需逐個查詢用戶；只有 HTML 的 Cookie 恢復需要驗證。
  if (authenticated === undefined) {
    const token = extractSessionToken(request);
    authenticated = token ? (await validateSession(env, token)).ok : false;
  }
  if (!authenticated) return privateResponse(response);
  const html = await response.text();
  const metadata = `<meta name="app-session" content="1"><meta name="app-path" content="${settings?.enabled ? settings.apiPrefix : '/api'}">`;
  // 只有驗證通過的 HTML 才收到運行時路徑；永遠不把 session token 寫進 HTML。
  return privateResponse(new Response(html.replace('</head>', `${metadata}</head>`), {
    status: response.status, headers: response.headers,
  }));
}

async function integration(request: Request, env, ctx, dispatch) {
  if (request.method !== 'POST') return null;
  const path = new URL(request.url).pathname;
  const telegram = path === '/api/integrations/telegram/webhook'
    && request.headers.has('X-Telegram-Bot-Api-Secret-Token');
  const bridge = path === '/api/integrations/instance-bridge/v1'
    && request.headers.has('x-edgechat-signature');
  if (!telegram && !bridge) return null;
  const response = await dispatch(request, env, ctx);
  // 協議自身先驗證 secret/HMAC。橋接簽名錯誤響應只可能在認證成功後生成，應保留供對端重試判定。
  if (response.ok || (bridge && response.headers.has('x-edgechat-signature'))) return privateResponse(response);
  return notFound();
}

export function createSiteEntry(dispatch) {
  return async (request: Request, env, ctx) => {
    try {
      const settings = await getStealthSettings(env.DB);
      const url = new URL(request.url);
      const path = url.pathname;
      if (!settings?.enabled) {
        if (path.startsWith('/api/') || path.startsWith('/files/')) {
          const response = await dispatch(request, env, ctx);
          return path.startsWith('/api/auth/') ? privateResponse(response) : response;
        }
        return await assets(request, env, settings);
      }

      if (path === settings.loginPath && request.method === 'POST') return await submitGate(request, env, settings);
      const callback = await integration(request, env, ctx, dispatch);
      if (callback) return callback;
      const token = extractSessionToken(request);
      const validation = token ? await validateSession(env, token) : { ok: false };
      if (!validation.ok) {
        if ((path === '/' || path === settings.loginPath) && ['GET', 'HEAD'].includes(request.method)) {
          const response = gatePage(settings);
          return request.method === 'HEAD' ? new Response(null, response) : response;
        }
        return notFound();
      }
      if (!cookieRequestAllowed(request)) return notFound();
      if (path === settings.loginPath) {
        return new Response(null, { status: 303, headers: { ...privateHeaders, Location: '/' } });
      }
      if (path.startsWith(`${settings.apiPrefix}/`)) {
        url.pathname = `/api${path.slice(settings.apiPrefix.length)}`;
        return privateResponse(await dispatch(new Request(url, request), env, ctx));
      }
      // 舊 API 僅對已有有效憑據兼容，不為未認證客戶端保留產品探測入口。
      if (path.startsWith('/api/') || path.startsWith('/files/')) {
        return privateResponse(await dispatch(request, env, ctx));
      }
      return await assets(request, env, settings, true);
    } catch (error) {
      console.error('Request failed', error);
      // 設置讀取異常時也不能回退到公開 SPA；故障頁面不攜帶應用異常或雲平臺信息。
      const path = new URL(request.url).pathname;
      if (path.startsWith('/api/v1/')) return privateResponse(v1ErrorResponse('temporarily_unavailable', '權限服務暫不可用', 503));
      if (path.startsWith('/api/')) return privateResponse(errorResponse('權限服務暫不可用', 503));
      return new Response('Service Unavailable', { status: 503, headers: privateHeaders });
    }
  };
}
