import { computed, ref, shallowRef } from 'vue';
import api from '../api.js';
import { t } from '../i18n.js';
import { isDemoMode } from '../runtime.js';
import { createVoiceCallClient, type CallSnapshot } from '../calls/client.ts';
import type { CallMode } from '../../../shared/voice-call.ts';
import { createCallRinger } from '../calls/ringer.ts';
import { isCapacitorAndroid } from '../capacitor-platform.ts';

export function useVoiceCall({ userId, error, notifyIncoming, shouldRing }) {
  const preferredMode = ref<CallMode>('auto');
  const state = shallowRef<CallSnapshot>({ call: null, phase: 'idle', muted: false, route: '', needsPlay: false, duration: 0 });
  const mode = computed(() => state.value.call && ['connecting', 'connected'].includes(state.value.phase)
    ? state.value.call.mode : preferredMode.value);
  const ringer = createCallRinger();
  const client = createVoiceCallClient({ api, userId,
    onChange: next => {
      if (next.phase === 'incoming' && state.value.phase !== 'incoming') {
        if (shouldRing(next.call)) ringer.start();
        if (document.visibilityState === 'hidden') notifyIncoming(next.call);
      } else if (next.phase !== 'incoming') {
        ringer.stop();
      }
      state.value = next;
    },
    onError: cause => {
      const message = cause.message;
      const mediaError = { NotAllowedError: 'voice.permissionDenied', NotFoundError: 'voice.noMicrophone', NotReadableError: 'voice.startFailed' }[cause.name];
      error.value = message?.startsWith('call.') ? t(message)
        : mediaError ? t(mediaError)
        : message || t('call.connectionFailed');
    }
  });
  function start(room) {
    if (isDemoMode) { error.value = t('call.demoUnavailable'); return; }
    if (!globalThis.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) { error.value = t('call.unsupported'); return; }
    void client.start(room, preferredMode.value);
  }
  function receive(event) { if (!isCapacitorAndroid) void client.receive(event); }
  function changeMode(value: CallMode) {
    preferredMode.value = value;
    void client.switchMode(value);
  }
  return { state, mode, start, receive, changeMode, accept: () => client.accept(preferredMode.value),
    hangup: client.hangup, toggleMute: client.toggleMute, play: client.play };
}
