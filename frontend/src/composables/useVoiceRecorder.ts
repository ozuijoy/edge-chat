import { onBeforeUnmount, onMounted, ref } from "vue";
import { requestNativeMicrophonePermission } from "../capacitor-platform.ts";
import { normalizeVoiceWaveform } from "../voice-message.js";

export interface VoiceRecording {
	file: File;
	durationMs: number;
	waveform: number[];
}

function recorderFormat() {
	const formats = [
		{ mimeType: "audio/webm;codecs=opus", extension: "webm" },
		{ mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
		{ mimeType: "audio/mp4", extension: "m4a" },
	];
	return formats.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType)) || null;
}

export function useVoiceRecorder() {
	const recording = ref(false);
	const starting = ref(false);
	const elapsedMs = ref(0);
	const liveWaveform = ref<number[]>([]);
	let recorder: MediaRecorder | null = null;
	let stream: MediaStream | null = null;
	let audioContext: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let timer: number | null = null;
	let chunks: Blob[] = [];
	let samples: number[] = [];
	let startedAt = 0;
	let extension = "webm";
	let generation = 0;

	function sampleAmplitude() {
		if (!analyser) return;
		const values = new Uint8Array(analyser.fftSize);
		analyser.getByteTimeDomainData(values);
		const energy = values.reduce((sum, value) => {
			const centered = (value - 128) / 128;
			return sum + centered * centered;
		}, 0);
		const level = Math.min(100, Math.max(6, Math.round(Math.sqrt(energy / values.length) * 260)));
		samples.push(level);
		liveWaveform.value = normalizeVoiceWaveform(samples.slice(-80), 32);
	}

	async function start() {
		if (recording.value || starting.value) return;
		if (!globalThis.navigator?.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
			throw new Error("voice_recording_unsupported");
		}
		const format = recorderFormat();
		if (!format) throw new Error("voice_recording_unsupported");
		const attempt = ++generation;
		starting.value = true;
		try {
			await requestNativeMicrophonePermission();
			if (attempt !== generation) return;
			const acquiredStream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
			});
			// 权限弹窗期间可以离开会话；迟到的授权结果不能在已关闭的页面继续占用麦克风。
			if (attempt !== generation) {
				acquiredStream.getTracks().forEach((track) => {
					track.stop();
				});
				return;
			}
			stream = acquiredStream;
			audioContext = new AudioContext();
			await audioContext.resume();
			if (attempt !== generation) return;
			analyser = audioContext.createAnalyser();
			analyser.fftSize = 256;
			audioContext.createMediaStreamSource(stream).connect(analyser);
			extension = format.extension;
			chunks = [];
			samples = [];
			elapsedMs.value = 0;
			liveWaveform.value = [];
			recorder = new MediaRecorder(stream, {
				mimeType: format.mimeType,
				audioBitsPerSecond: 64_000,
			});
			recorder.addEventListener("dataavailable", (event) => {
				if (event.data.size) chunks.push(event.data);
			});
			recorder.start(250);
			startedAt = performance.now();
			recording.value = true;
			timer = window.setInterval(() => {
				elapsedMs.value = Math.round(performance.now() - startedAt);
				sampleAmplitude();
			}, 100);
		} catch (error) {
			if (attempt !== generation) return;
			recorder = null;
			closeDevices();
			throw error;
		} finally {
			if (attempt === generation) starting.value = false;
		}
	}

	function closeDevices() {
		if (timer !== null) window.clearInterval(timer);
		timer = null;
		stream?.getTracks().forEach((track) => {
			track.stop();
		});
		stream = null;
		void audioContext?.close();
		audioContext = null;
		analyser = null;
		recording.value = false;
	}

	async function stopRecorder() {
		const activeRecorder = recorder;
		if (!activeRecorder || activeRecorder.state === "inactive") return;
		await new Promise<void>((resolve) => {
			activeRecorder.addEventListener("stop", () => resolve(), { once: true });
			activeRecorder.stop();
		});
		recorder = null;
	}

	async function finish(): Promise<VoiceRecording | null> {
		if (!recording.value || !recorder) return null;
		const durationMs = Math.max(elapsedMs.value, Math.round(performance.now() - startedAt));
		await stopRecorder();
		const blob = new Blob(chunks, { type: chunks[0]?.type || `audio/${extension}` });
		const waveform = normalizeVoiceWaveform(samples, 48);
		closeDevices();
		return {
			file: new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type }),
			durationMs,
			waveform,
		};
	}

	async function cancel() {
		generation++;
		starting.value = false;
		if (recorder?.state !== "inactive") await stopRecorder();
		chunks = [];
		samples = [];
		elapsedMs.value = 0;
		liveWaveform.value = [];
		closeDevices();
	}

	function handleVisibilityChange() {
		// 切到后台后不保留不可见的录音；授权弹窗期间尚未录音，不在这里取消系统授权。
		if (document.hidden && recording.value) void cancel();
	}

	onMounted(() => document.addEventListener("visibilitychange", handleVisibilityChange));
	onBeforeUnmount(() => {
		document.removeEventListener("visibilitychange", handleVisibilityChange);
		void cancel();
	});

	return { recording, starting, elapsedMs, liveWaveform, start, finish, cancel };
}
