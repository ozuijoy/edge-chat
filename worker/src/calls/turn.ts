import { ApiError } from '../errors.js';

export function turnConfigured(env): boolean {
  return Boolean(env.EDGECHAT_TURN_KEY_ID && env.EDGECHAT_TURN_API_TOKEN);
}

export async function generateCallIceServers(env, fetcher = fetch) {
  if (!turnConfigured(env)) throw new ApiError('TURN 尚未配置', 503);
  const response = await fetcher(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.EDGECHAT_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.EDGECHAT_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 3600 }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new ApiError('TURN 暂时不可用', 503);
  const payload = await response.json();
  if (!Array.isArray(payload.iceServers)) throw new ApiError('TURN 暂时不可用', 503);
  // 浏览器阻止端口 53，移除它可以避免无意义的候选连接超时。
  const iceServers = payload.iceServers.map(server => ({
    urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(url => typeof url === 'string' && !/:53(?:\?|$)/.test(url)),
    ...(server.username ? { username: server.username, credential: server.credential } : {})
  })).filter(server => server.urls.length);
  if (!iceServers.some(server => server.urls.some(url => /^turns?:/.test(url)))) throw new ApiError('TURN 暂时不可用', 503);
  return { iceServers };
}
