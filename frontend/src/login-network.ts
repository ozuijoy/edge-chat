type ProbeResult = { status: 'completed' | 'timeout' | 'unsupported' | 'failed'; ips: string[] };

export function probeWebRtc({ signal, timeoutMs = 2000, PeerConnection = globalThis.RTCPeerConnection }:
  { signal: AbortSignal; timeoutMs?: number; PeerConnection?: typeof RTCPeerConnection }): Promise<ProbeResult> {
  if (!PeerConnection) return Promise.resolve({ status: 'unsupported', ips: [] });
  if (signal.aborted) return Promise.resolve({ status: 'failed', ips: [] });
  return new Promise((resolve) => {
    let peer: RTCPeerConnection;
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    const ips = new Set<string>();
    const finish = (status: ProbeResult['status']) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      if (peer) {
        peer.onicecandidate = null;
        peer.close();
      }
      resolve({ status, ips: status === 'failed' ? [] : [...ips] });
    };
    const cancel = () => finish('failed');
    try {
      // 只收集 STUN 返回的地址，不采集局域网 host/mDNS，也不使用媒体或 TURN 中继。
      peer = new PeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], iceCandidatePoolSize: 0 });
      signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => finish('timeout'), timeoutMs);
      peer.onicecandidate = ({ candidate }) => {
        if (!candidate) return finish('completed');
        if (candidate.type === 'srflx' && candidate.address && ips.size < 4) ips.add(candidate.address);
      };
      peer.createDataChannel('network-check');
      void peer.createOffer().then((offer) => {
        if (!settled) return peer.setLocalDescription(offer);
      }).catch(() => finish('failed'));
    } catch {
      finish('failed');
    }
  });
}
