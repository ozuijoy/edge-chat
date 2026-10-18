export function isAudioAttachment(attachment) {
	return String(attachment?.type || "").toLowerCase().startsWith("audio/");
}

export function formatVoiceDuration(durationMs) {
	const totalSeconds = Math.max(0, Math.round(Number(durationMs) / 1000) || 0);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = String(totalSeconds % 60).padStart(2, "0");
	return `${minutes}:${seconds}`;
}

export function normalizeVoiceWaveform(samples, targetCount = 42) {
	const values = Array.from(samples || [], (sample) =>
		Math.min(Math.max(Math.round(Number(sample) || 0), 0), 100),
	);
	if (!values.length) return [];
	if (values.length <= targetCount) return values;
	return Array.from({ length: targetCount }, (_, index) => {
		const start = Math.floor((index * values.length) / targetCount);
		const end = Math.max(start + 1, Math.floor(((index + 1) * values.length) / targetCount));
		return Math.max(...values.slice(start, end));
	});
}

export function fallbackVoiceWaveform(seed, count = 42) {
	let state = Array.from(String(seed || "voice")).reduce(
		(hash, character) => (hash * 31 + character.codePointAt(0)) >>> 0,
		2166136261,
	);
	return Array.from({ length: count }, (_, index) => {
		state = (state * 1664525 + 1013904223) >>> 0;
		const envelope = 0.68 + 0.32 * Math.sin((index / Math.max(count - 1, 1)) * Math.PI);
		return Math.round((24 + (state % 68)) * envelope);
	});
}
