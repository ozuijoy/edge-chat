<script setup lang="ts">
import { Mic, MicOff, Phone, PhoneOff, Volume2 } from '@lucide/vue';
import { useI18n } from '../../i18n.js';
defineProps({ state: { type: Object, required: true } });
defineEmits(['accept', 'hangup', 'mute', 'play']);
const { t } = useI18n();
function duration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
</script>

<template>
  <section v-if="state.call" class="voice-call-bar" :aria-label="t('call.voice')">
    <div class="voice-call-bar__identity" role="status" aria-live="polite">
      <strong :title="state.call.name">{{ state.call.name }}</strong>
      <span>{{ t(`call.${state.phase}`) }}<template v-if="state.route"> · {{ state.route }} · {{ duration(state.duration) }}</template></span>
    </div>
    <button v-if="state.phase === 'incoming'" type="button" class="voice-call-bar__accept" :aria-label="t('call.accept')" :title="t('call.accept')" @click="$emit('accept')"><Phone :size="20" /></button>
    <button v-if="['connecting', 'connected'].includes(state.phase)" type="button" :aria-label="state.muted ? t('call.unmute') : t('call.mute')" :title="state.muted ? t('call.unmute') : t('call.mute')" :aria-pressed="state.muted" @click="$emit('mute')"><MicOff v-if="state.muted" :size="20" /><Mic v-else :size="20" /></button>
    <button v-if="state.needsPlay" type="button" :aria-label="t('call.play')" :title="t('call.play')" @click="$emit('play')"><Volume2 :size="20" /></button>
    <button type="button" class="voice-call-bar__hangup" :aria-label="state.phase === 'incoming' ? t('call.reject') : t('call.hangup')" :title="state.phase === 'incoming' ? t('call.reject') : t('call.hangup')" @click="$emit('hangup')"><PhoneOff :size="20" /></button>
  </section>
</template>

<style scoped>
.voice-call-bar { position: fixed; z-index: 70; top: var(--chat-viewport-offset-top, 0px); left: 0; width: 100%; height: 64px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--chat-line); background: var(--chat-selected); color: var(--chat-ink); }
.voice-call-bar__identity { flex: 1; min-width: 0; }
.voice-call-bar__identity strong, .voice-call-bar__identity span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 1.5; }
.voice-call-bar__identity span { font-variant-numeric: tabular-nums; }
.voice-call-bar button { flex: 0 0 44px; width: 44px; height: 44px; border: 0; border-radius: 6px; display: grid; place-items: center; background: transparent; color: inherit; cursor: pointer; }
.voice-call-bar button:hover { background: #0001; }
.voice-call-bar button:focus-visible { outline: 2px solid var(--chat-accent, #227a50); outline-offset: 2px; }
.voice-call-bar .voice-call-bar__accept { background: #257d4e; color: #fff; }
.voice-call-bar .voice-call-bar__hangup { background: #bf3434; color: #fff; }
@media (max-width: 600px) { .voice-call-bar { padding: 8px; } }
</style>
