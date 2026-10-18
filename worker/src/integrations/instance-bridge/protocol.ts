import { isIP } from "node:net";
import { ApiError } from "../../errors.js";

export const BRIDGE_PATH = "/api/integrations/instance-bridge/v1";
export const MESSAGE_TTL = 86_400_000;
export const INVITE_TTL = 600_000;
export const CLOCK_SKEW = 300_000;
const encoder = new TextEncoder();

export type Endpoint = { instanceId: string; origin: string; channelId: number; channelName: string };
export type Envelope = {
  v: 1; type: "claim" | "activate" | "state" | "message";
  bindingId: string; from: Endpoint; to: Endpoint; sentAt: number; nonce: string;
  data: Record<string, unknown>;
};

export function bridgeError(code: string, status = 400) {
  return new ApiError(`跨实例绑定：${code}`, status, code);
}

export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9-]{32,36}$/.test(value);
}

export function normalizeOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length > 253) throw bridgeError("invalid_origin");
  let url: URL;
  try { url = new URL(value); } catch { throw bridgeError("invalid_origin"); }
  const host = url.hostname;
  if (url.protocol !== "https:" || url.port || url.username || url.password
    || url.pathname !== "/" || url.search || url.hash || isIP(host.replace(/^\[|\]$/g, ""))
    || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
    || /(?:^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host)) {
    throw bridgeError("invalid_origin");
  }
  return url.origin;
}

export function publicIp(value: string) {
  if (isIP(value) === 4) {
    const [a, b] = value.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 || b === 2)) || (a === 198 && [18, 19, 51].includes(b))
      || (a === 203 && b === 0));
  }
  // 只允许全球单播，排除本地、映射 IPv4、文档及协议保留地址。
  return isIP(value) === 6 && /^[23]/i.test(value)
    && !/^2001:(?:0:|db8:|[12][0-9a-f]:)/i.test(value) && !/^2002:/i.test(value);
}

export async function validatePublicDns(origin: string, fetcher = fetch) {
  const host = new URL(normalizeOrigin(origin)).hostname;
  const answers = await Promise.all(["A", "AAAA"].map(async (type) => {
    const response = await fetcher(`https://cloudflare-dns.com/dns-query?name=${host}&type=${type}`, {
      headers: { accept: "application/dns-json" }, redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw bridgeError("dns_unavailable", 502);
    const data = await response.json() as { Status: number; Answer?: { type: number; data: string }[] };
    if (data.Status !== 0 && data.Status !== 3) throw bridgeError("dns_unavailable", 502);
    return (data.Answer || []).filter((r) => r.type === 1 || r.type === 28).map((r) => r.data);
  }));
  const ips = answers.flat();
  if (!ips.length || ips.some((ip) => !publicIp(ip))) throw bridgeError("unsafe_address", 400);
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function sign(secret: string, value: string) {
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(value)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verify(secret: string, value: string, signature: string) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const bytes = Uint8Array.from({ length: 32 }, (_, i) => Number.parseInt(signature.slice(i * 2, i * 2 + 2), 16));
  return crypto.subtle.verify("HMAC", await hmacKey(secret), bytes, encoder.encode(value));
}

export function validateEndpoint(endpoint: Endpoint) {
  if (!endpoint || !validId(endpoint.instanceId) || !Number.isSafeInteger(endpoint.channelId)
    || endpoint.channelId <= 0 || typeof endpoint.channelName !== "string"
    || !endpoint.channelName.trim() || endpoint.channelName.length > 120) throw bridgeError("invalid_endpoint");
  if (normalizeOrigin(endpoint.origin) !== endpoint.origin) throw bridgeError("invalid_origin");
}

export function validateEnvelope(value: Envelope, now = Date.now()) {
  if (!value || value.v !== 1 || !["claim", "activate", "state", "message"].includes(value.type)
    || !validId(value.bindingId) || !validId(value.nonce) || !Number.isSafeInteger(value.sentAt)
    || Math.abs(now - value.sentAt) > CLOCK_SKEW || !value.data || typeof value.data !== "object") {
    throw bridgeError("invalid_or_expired_request", 401);
  }
  validateEndpoint(value.from);
  validateEndpoint(value.to);
}

export async function readLimitedText(response: Request | Response, max = 20_480) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > max) throw bridgeError("payload_too_large", 413);
      chunks.push(result.value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export async function signedResponse(secret: string, nonce: string, data: unknown, status = 200) {
  const body = JSON.stringify(data);
  return new Response(body, { status, headers: {
    "content-type": "application/json", "cache-control": "no-store",
    "x-edgechat-signature": await sign(secret, `response\n${nonce}\n${status}\n${body}`),
  } });
}

export async function sendEnvelope(secret: string, envelope: Envelope, {
  fetcher = fetch, checkDns = validatePublicDns,
} = {}) {
  const origin = normalizeOrigin(envelope.to.origin);
  await checkDns(origin);
  const body = JSON.stringify(envelope);
  const response = await fetcher(`${origin}${BRIDGE_PATH}`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/json", "x-edgechat-signature": await sign(secret, body) }, body,
  });
  const text = await readLimitedText(response);
  if (!await verify(secret, `response\n${envelope.nonce}\n${response.status}\n${text}`,
    response.headers.get("x-edgechat-signature") || "")) throw bridgeError("invalid_peer_response", 502);
  let result: { ok?: boolean; error?: { code?: string } };
  try { result = JSON.parse(text); } catch { throw bridgeError("invalid_peer_response", 502); }
  if (!response.ok || !result.ok) throw bridgeError(result.error?.code || "peer_rejected", response.status);
  return result;
}
