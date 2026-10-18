import assert from "node:assert/strict";
import test from "node:test";

import { pickAttachment } from "../worker/src/utils.js";
import {
	fallbackVoiceWaveform,
	formatVoiceDuration,
	normalizeVoiceWaveform,
} from "../frontend/src/voice-message.js";

test("语音附件只保留受控时长和短波形", () => {
	assert.deepEqual(
		pickAttachment({
			key: "7/voice.ogg",
			name: "voice.ogg",
			type: "audio/ogg; codecs=opus",
			size: 1024,
			kind: "voice",
			durationMs: 8123.6,
			waveform: [-4, 12.4, 110],
		}, { ownerUserId: 7 }),
		{
			key: "7/voice.ogg",
			name: "voice.ogg",
			type: "audio/ogg; codecs=opus",
			size: 1024,
			url: "/files/7%2Fvoice.ogg",
			kind: "voice",
			durationMs: 8124,
			waveform: [0, 12, 100],
		},
	);
});

test("普通音频附件不会被伪造成语音便笺", () => {
	const attachment = pickAttachment({
		key: "7/song.mp3",
		name: "song.mp3",
		type: "audio/mpeg",
		size: 2048,
		kind: "document",
		durationMs: 9000,
		waveform: [50],
	}, { ownerUserId: 7 });
	assert.equal(attachment.kind, undefined);
	assert.equal(attachment.durationMs, undefined);
	assert.equal(attachment.waveform, undefined);
});

test("普通音频可保留时长但不会获得语音波形", () => {
	const attachment = pickAttachment({
		key: "7/song.mp3",
		name: "song.mp3",
		type: "audio/mpeg",
		size: 2048,
		kind: "audio",
		durationMs: 12_000,
		waveform: [50],
	}, { ownerUserId: 7 });
	assert.equal(attachment.kind, "audio");
	assert.equal(attachment.durationMs, 12_000);
	assert.equal(attachment.waveform, undefined);
});

test("网页语音时长和波形 helper 保持紧凑稳定", () => {
	assert.equal(formatVoiceDuration(65_400), "1:05");
	assert.deepEqual(normalizeVoiceWaveform([5, 30, 10, 90], 2), [30, 90]);
	assert.deepEqual(fallbackVoiceWaveform("same", 8), fallbackVoiceWaveform("same", 8));
	assert.equal(fallbackVoiceWaveform("same", 8).length, 8);
});
