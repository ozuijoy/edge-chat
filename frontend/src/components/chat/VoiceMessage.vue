<script setup>
import { Pause, Play } from "@lucide/vue";
import { computed, onBeforeUnmount, ref } from "vue";
import api from "../../api.js";
import { t } from "../../i18n.js";
import {
	fallbackVoiceWaveform,
	formatVoiceDuration,
	normalizeVoiceWaveform,
} from "../../voice-message.js";

const props = defineProps({
	attachment: { type: Object, required: true },
});

const audio = ref(null);
const playing = ref(false);
const failed = ref(false);
const currentMs = ref(0);
const measuredDurationMs = ref(0);
const speed = ref(1);
const playbackKey = computed(() => props.attachment?.key || props.attachment?.url || props.attachment?.name);
const attachmentUrl = computed(() => api.getFileUrl(props.attachment?.key || props.attachment?.url));
const durationMs = computed(() => Number(props.attachment?.durationMs || 0) || measuredDurationMs.value);
const progress = computed(() => Math.min(currentMs.value / Math.max(durationMs.value, 1), 1));
const waveform = computed(() => {
	const provided = normalizeVoiceWaveform(props.attachment?.waveform, 42);
	return provided.length ? provided : fallbackVoiceWaveform(playbackKey.value, 42);
});

function pauseOtherVoice(event) {
	if (event.detail !== playbackKey.value) audio.value?.pause();
}

globalThis.addEventListener?.("edgechat:voice-play", pauseOtherVoice);

async function togglePlayback() {
	if (!audio.value) return;
	if (audio.value.paused) {
		globalThis.dispatchEvent(new CustomEvent("edgechat:voice-play", { detail: playbackKey.value }));
		try {
			await audio.value.play();
		} catch {
			failed.value = true;
		}
	} else {
		audio.value.pause();
	}
}

function updateMetadata() {
	if (Number.isFinite(audio.value?.duration)) {
		measuredDurationMs.value = Math.round(audio.value.duration * 1000);
	}
}

function updateProgress() {
	currentMs.value = Math.round((audio.value?.currentTime || 0) * 1000);
}

function resetProgress() {
	playing.value = false;
	currentMs.value = 0;
}

function seek(event) {
	if (!audio.value || !durationMs.value) return;
	audio.value.currentTime = (Number(event.target.value) / 1000) * (durationMs.value / 1000);
	updateProgress();
}

function cycleSpeed() {
	speed.value = speed.value === 1 ? 1.5 : speed.value === 1.5 ? 2 : 1;
	if (audio.value) audio.value.playbackRate = speed.value;
}

onBeforeUnmount(() => {
	globalThis.removeEventListener?.("edgechat:voice-play", pauseOtherVoice);
	audio.value?.pause();
});
</script>

<template>
	<div class="voice-message" :class="{ 'voice-message--file': attachment.kind !== 'voice' }">
		<audio
			ref="audio"
			:src="attachmentUrl"
			preload="metadata"
			@loadedmetadata="updateMetadata"
			@durationchange="updateMetadata"
			@timeupdate="updateProgress"
			@play="playing = true"
			@pause="playing = false"
			@ended="resetProgress"
			@error="failed = true"
		/>
		<template v-if="!failed">
			<button
				type="button"
				class="voice-message__play"
				:title="playing ? t('voice.pause') : t('voice.play')"
				:aria-label="playing ? t('voice.pause') : t('voice.play')"
				@click="togglePlayback"
			>
				<Pause v-if="playing" :size="20" fill="currentColor" aria-hidden="true" />
				<Play v-else :size="20" fill="currentColor" aria-hidden="true" />
			</button>
			<div class="voice-message__body">
				<div v-if="attachment.kind !== 'voice'" class="voice-message__name">{{ attachment.name }}</div>
				<div class="voice-waveform">
					<span
						v-for="(sample, index) in waveform"
						:key="index"
						class="voice-waveform__bar"
						:class="{ 'voice-waveform__bar--played': index / waveform.length <= progress }"
						:style="{ height: `${Math.max(18, sample)}%` }"
					></span>
					<input
						class="voice-waveform__seek"
						type="range"
						min="0"
						max="1000"
						:value="Math.round(progress * 1000)"
						:aria-label="t('voice.seek')"
						@input="seek"
					/>
				</div>
				<div class="voice-message__meta">
					<span>{{ formatVoiceDuration(playing || currentMs ? currentMs : durationMs) }}</span>
					<button type="button" class="voice-message__speed" :aria-label="t('voice.speed')" @click="cycleSpeed">
						{{ speed }}x
					</button>
				</div>
			</div>
		</template>
		<a v-else :href="attachmentUrl" target="_blank" rel="noreferrer" class="message-attachment__file">
			{{ attachment.name || t('voice.fallback') }}
		</a>
	</div>
</template>
