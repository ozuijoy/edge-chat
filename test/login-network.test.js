import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { probeWebRtc } from '../frontend/src/login-network.ts';

function mockPeer(mode = 'completed') {
  const peers = [];
  class Peer {
    constructor(config) { this.config = config; peers.push(this); }
    createDataChannel(name) { this.channel = name; }
    async createOffer() {
      if (mode === 'failed') throw new Error('offer failed');
      return { type: 'offer', sdp: 'test' };
    }
    async setLocalDescription() {
      if (mode === 'timeout') return;
      for (const candidate of [
        { type: 'host', address: '192.168.1.10' }, { type: 'host', address: 'test.local' },
        { type: 'relay', address: '192.0.2.50' },
        ...['192.0.2.10', '192.0.2.10', '2001:db8::10', '192.0.2.11', '192.0.2.12', '192.0.2.13']
          .map((address) => ({ type: 'srflx', address })),
      ]) this.onicecandidate?.({ candidate });
      this.onicecandidate?.({ candidate: null });
    }
    close() { this.closed = true; }
  }
  return { Peer, peers };
}

test('WebRTC 探測：只收 STUN 地址、去重限量並釋放，無媒體或 TURN', async () => {
  const { Peer, peers } = mockPeer();
  const result = await probeWebRtc({ signal: new AbortController().signal, PeerConnection: Peer });
  assert.deepEqual(result, { status: 'completed', ips: ['192.0.2.10', '2001:db8::10', '192.0.2.11', '192.0.2.12'] });
  assert.deepEqual(peers[0].config.iceServers, [{ urls: 'stun:stun.cloudflare.com:3478' }]);
  assert.equal(peers[0].closed, true);
  assert.equal(peers[0].onicecandidate, null);
});

test('WebRTC 探測：超時、協商失敗、構造失敗和不支持不阻斷', async () => {
  for (const mode of ['timeout', 'failed']) {
    const { Peer, peers } = mockPeer(mode);
    assert.deepEqual(await probeWebRtc({ signal: new AbortController().signal, PeerConnection: Peer, timeoutMs: 5 }), { status: mode, ips: [] });
    assert.equal(peers[0].closed, true);
  }
  class BrokenPeer { constructor() { throw new Error('disabled'); } }
  assert.deepEqual(await probeWebRtc({ signal: new AbortController().signal, PeerConnection: BrokenPeer }), { status: 'failed', ips: [] });
  assert.deepEqual(await probeWebRtc({ signal: new AbortController().signal, PeerConnection: null }), { status: 'unsupported', ips: [] });
});

test('WebRTC 探測：登出取消和已取消請求均釋放，不遲到採集', async () => {
  const { Peer, peers } = mockPeer('timeout');
  const controller = new AbortController();
  const pending = probeWebRtc({ signal: controller.signal, PeerConnection: Peer });
  controller.abort();
  assert.deepEqual(await pending, { status: 'failed', ips: [] });
  assert.equal(peers[0].closed, true);
  await probeWebRtc({ signal: controller.signal, PeerConnection: Peer });
  assert.equal(peers.length, 1);
});

test('WebRTC 觸發契約：按需分包、登錄 ID 去重、demo 和 Android 不探測', () => {
  const store = readFileSync(new URL('../frontend/src/store.js', import.meta.url), 'utf8');
  const probe = readFileSync(new URL('../frontend/src/login-network.ts', import.meta.url), 'utf8');
  assert.match(store, /import\('\.\/login-network.ts'\)/);
  assert.match(store, /isDemoMode \|\| isCapacitorAndroid \|\| !session.loginProbeId/);
  assert.match(store, /localStorage.getItem\('edgechat.login-probe'\) === session.loginProbeId/);
  assert.match(store, /controller.signal.aborted \|\| state.token !== session.token/);
  assert.doesNotMatch(probe, /getUserMedia|turn:|iceTransportPolicy/);
});
