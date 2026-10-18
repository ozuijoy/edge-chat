import { CALL_RING_MS, CALL_STUN, type CallMode, type CallAction } from '../../../shared/voice-call.ts';

interface CallSession {
  callId: string; roomId: number; callerId: number; calleeId: number; name: string;
  mode: CallMode; callerClient?: string; calleeClient?: string;
}
interface CallEvent extends CallSession {
  type: string; revision: number; expiresAt: number; reason?: string;
  users?: { id: number; name: string }[];
  signal?: { type: 'offer' | 'answer' | 'ice'; sdp?: string; candidate?: RTCIceCandidateInit };
}
export interface CallSnapshot {
  call: CallSession | null; phase: string; muted: boolean; route: string; needsPlay: boolean; duration: number;
}
interface CallApi {
  callConfig(roomId: number): Promise<{ turnAvailable: boolean }>;
  callAction(roomId: number, action: CallAction): Promise<unknown>;
  callIce(roomId: number, callId: string, clientId: string): Promise<{ iceServers: RTCIceServer[] }>;
}
interface CallClientOptions {
  api: CallApi; userId: number; onChange(state: CallSnapshot): void; onError(error: Error): void;
  getMedia?: () => Promise<MediaStream>; createPeer?: (config: RTCConfiguration) => RTCPeerConnection;
  createAudio?: () => HTMLAudioElement; clientId?: string;
}

export function createVoiceCallClient({ api, userId, onChange, onError,
  getMedia = () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }),
  createPeer = config => new RTCPeerConnection(config),
  createAudio = () => new Audio(),
  clientId = crypto.randomUUID() }: CallClientOptions) {
  let call: CallSession | null = null;
  let peer: RTCPeerConnection | null = null;
  let stream: MediaStream | null = null;
  let audio: HTMLAudioElement | null = null;
  let generation = 0;
  let revision = 0;
  let candidates: RTCIceCandidateInit[] = [];
  let fallbackTimer: ReturnType<typeof setTimeout>;
  let ringTimer: ReturnType<typeof setTimeout>;
  let heartbeat: ReturnType<typeof setInterval>;
  let clock: ReturnType<typeof setInterval>;
  let connectedAt = 0;
  let turnAvailable = false;
  let eventQueue = Promise.resolve();
  let actionQueue = Promise.resolve();
  let phase = 'idle';
  let muted = false;
  let route = '';
  let needsPlay = false;
  const change = () => onChange({ call, phase, muted, route, needsPlay,
    duration: connectedAt ? Math.floor((Date.now() - connectedAt) / 1000) : 0 });
  const action = (type: string, extra: Partial<CallAction> = {}) => {
    if (!call) return Promise.reject(new Error('call.ended'));
    const roomId = call.roomId;
    const payload = { type, callId: call.callId, clientId, ...extra };
    const pending = actionQueue.then(() => api.callAction(roomId, payload)).catch(error => {
      // 重协商已推进时，旧候选/SDP 只需丢弃，不能把新连接一起挂断。
      if (['ice', 'offer', 'answer'].includes(type) && error.status === 409 && error.rawMessage === '通话协商已更新') return;
      throw error;
    });
    actionQueue = pending.catch(() => {});
    return pending;
  };
  function closePeer() {
    clearTimeout(fallbackTimer);
    if (peer) { peer.onicecandidate = null; peer.onconnectionstatechange = null; peer.ontrack = null; peer.close(); }
    peer = null;
    candidates = [];
    if (audio) { audio.pause(); audio.srcObject = null; }
    audio = null;
  }
  function reset() {
    generation++;
    clearTimeout(ringTimer);
    clearInterval(heartbeat);
    clearInterval(clock);
    closePeer();
    stream?.getTracks().forEach(track => { track.stop(); });
    stream = null;
    call = null;
    revision = 0;
    phase = 'idle';
    route = '';
    muted = false;
    connectedAt = 0;
    needsPlay = false;
    change();
  }
  async function hangup() {
    const pending = call ? action(userId !== call.callerId && !call.calleeClient ? 'reject' : 'hangup') : Promise.resolve();
    reset();
    await pending.catch(() => {});
  }
  async function fail(error) {
    onError(error);
    await hangup();
  }
  async function acquireMedia(epoch) {
    const media = await getMedia();
    // 用户可在授权弹窗仍打开时取消，迟到的媒体流不能留在后台采集。
    if (epoch !== generation) { media.getTracks().forEach(track => { track.stop(); }); return false; }
    stream = media;
    return true;
  }
  function startTimers() {
    clearTimeout(ringTimer);
    if (phase === 'calling') ringTimer = setTimeout(() => { void fail(new Error('call.noAnswer')); }, CALL_RING_MS);
    heartbeat = setInterval(() => { void action('heartbeat').catch(fail); }, 25_000);
    clock = setInterval(change, 1000);
  }
  async function start(room, mode: CallMode) {
    if (call || room.kind !== 'dm' || room.isBlockedByMe) return;
    const epoch = ++generation;
    call = { callId: crypto.randomUUID(), roomId: Number(room.id), callerId: userId,
      calleeId: room.otherUser.id, name: room.otherUser.displayName || room.otherUser.username || room.name, mode };
    phase = 'permission'; change();
    try {
      const config = await api.callConfig(call.roomId);
      if (epoch !== generation) return;
      turnAvailable = config.turnAvailable;
      if (mode === 'relay' && !turnAvailable) throw new Error('call.turnUnavailable');
      if (!await acquireMedia(epoch)) return;
      phase = 'calling'; change();
      await action('start', { mode });
      if (epoch === generation) startTimers();
    } catch (error) { if (epoch === generation) await fail(error); }
  }
  async function accept(mode: CallMode) {
    if (phase !== 'incoming') return;
    const epoch = generation;
    phase = 'permission'; change();
    try {
      const config = await api.callConfig(call.roomId);
      if (epoch !== generation) return;
      turnAvailable = config.turnAvailable;
      if ((mode === 'relay' || call.mode === 'relay') && !turnAvailable) throw new Error('call.turnUnavailable');
      if (!await acquireMedia(epoch)) return;
      phase = 'connecting'; change();
      await action('accept', { mode });
      if (epoch === generation) startTimers();
    } catch (error) { if (epoch === generation) await fail(error); }
  }
  async function switchMode(mode: CallMode) {
    if (!call || !['connecting', 'connected'].includes(phase) || call.mode === mode) return;
    if (mode === 'relay' && !turnAvailable) { onError(new Error('call.turnUnavailable')); return; }
    clearTimeout(fallbackTimer);
    await action('restart', { mode }).catch(fail);
  }
  function connectionTimeout() {
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => {
      if (call?.mode === 'auto' && turnAvailable) void switchMode('relay');
      else void fail(new Error('call.connectionFailed'));
    }, call?.mode === 'relay' ? 20_000 : 12_000);
  }
  async function negotiate(event: CallEvent) {
    if (event.revision <= revision) return;
    const epoch = generation;
    closePeer();
    revision = event.revision;
    call.mode = event.mode;
    call.callerClient = event.callerClient;
    call.calleeClient = event.calleeClient;
    phase = 'connecting'; route = ''; change();
    clearTimeout(ringTimer);
    let iceServers: RTCIceServer[] = CALL_STUN;
    if (event.mode === 'relay') {
      const config = await api.callIce(call.roomId, call.callId, clientId);
      if (epoch !== generation || event.revision !== revision) return;
      iceServers = config.iceServers;
    }
    const current = createPeer({ iceServers, iceTransportPolicy: event.mode === 'relay' ? 'relay' : 'all' });
    peer = current;
    stream.getTracks().forEach(track => { current.addTrack(track, stream); });
    current.onicecandidate = e => {
      if (peer === current && e.candidate) void action('ice', { revision: event.revision, candidate: e.candidate.toJSON() }).catch(error => {
        if (peer === current) void fail(error);
      });
    };
    current.ontrack = e => {
      if (peer !== current) return;
      audio = createAudio();
      audio.autoplay = true;
      audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      void audio.play().catch(() => { needsPlay = true; change(); });
    };
    current.onconnectionstatechange = () => {
      if (peer !== current) return;
      if (current.connectionState === 'connected') {
        clearTimeout(fallbackTimer);
        phase = 'connected';
        if (!connectedAt) connectedAt = Date.now();
        route = event.mode === 'relay' ? 'TURN' : 'P2P'; change();
      } else if (['failed', 'disconnected'].includes(current.connectionState)) {
        phase = 'connecting'; change(); connectionTimeout();
      }
    };
    connectionTimeout();
    if (userId === call.callerId) {
      await current.setLocalDescription(await current.createOffer());
      if (peer === current) await action('offer', { revision, sdp: current.localDescription.sdp });
    }
  }
  async function handleEvent(event: CallEvent) {
    if (event.type === 'call_invite') {
      if (event.calleeId !== userId || event.expiresAt <= Date.now()) return;
      if (call) {
        if (call.callId !== event.callId) {
          await api.callAction(event.roomId, { type: 'reject', callId: event.callId, clientId });
        }
        return;
      }
      generation++;
      call = { ...event, name: event.users?.find(user => user.id === event.callerId)?.name || '' };
      phase = 'incoming'; change();
      ringTimer = setTimeout(reset, Math.max(0, event.expiresAt - Date.now()));
      return;
    }
    if (!call || event.callId !== call.callId) return;
    if (event.type === 'call_ended') {
      if (event.reason === 'rejected') onError(new Error('call.rejected'));
      if (event.reason === 'timeout') onError(new Error('call.noAnswer'));
      if (event.reason === 'limit') onError(new Error('call.limit'));
      reset(); return;
    }
    if (event.type === 'call_negotiate') {
      if ((userId === event.callerId ? event.callerClient : event.calleeClient) !== clientId) { reset(); return; }
      await negotiate(event); return;
    }
    if (event.type !== 'call_signal' || !peer || event.revision !== revision) return;
    const signal = event.signal;
    const current = peer;
    if (signal.type === 'ice') {
      if (current.remoteDescription) await current.addIceCandidate(signal.candidate);
      else candidates.push(signal.candidate);
      return;
    }
    await current.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
    if (peer !== current) return;
    for (const candidate of candidates) await current.addIceCandidate(candidate);
    candidates = [];
    if (signal.type === 'offer') {
      const answer = await current.createAnswer();
      if (peer !== current) return;
      await current.setLocalDescription(answer);
      if (peer === current) await action('answer', { revision, sdp: current.localDescription.sdp });
    }
  }
  function receive(event: CallEvent) {
    const epoch = generation;
    eventQueue = eventQueue.then(() => handleEvent(event)).catch(error => {
      if (epoch === generation) return fail(error);
    });
    return eventQueue;
  }
  function toggleMute() {
    muted = !muted;
    stream?.getAudioTracks().forEach(track => { track.enabled = !muted; }); change();
  }
  async function play() {
    try { await audio?.play(); needsPlay = false; change(); }
    catch { onError(new Error('call.playFailed')); }
  }
  return { start, accept, hangup, switchMode, receive, toggleMute, play, reset };
}
