import assert from "node:assert/strict";
import test from "node:test";

import { pickAttachment } from "../worker/src/utils.js";
import {
	fallbackVoiceWaveform,
	formatVoiceDuration,
	normalizeVoiceWaveform,
} from "../frontend/src/voice-message.js";

test("語音附件只保留受控時長和短波形", () => {
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

test("普通音頻附件不會被偽造成語音便箋", () => {
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

test("普通音頻可保留時長但不會獲得語音波形", () => {
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

test("網頁語音時長和波形 helper 保持緊湊穩定", () => {
	assert.equal(formatVoiceDuration(65_400), "1:05");
	assert.deepEqual(normalizeVoiceWaveform([5, 30, 10, 90], 2), [30, 90]);
	assert.deepEqual(fallbackVoiceWaveform("same", 8), fallbackVoiceWaveform("same", 8));
	assert.equal(fallbackVoiceWaveform("same", 8).length, 8);
});
