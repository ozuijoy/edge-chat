import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const recorderUrl = new URL("../frontend/src/composables/useVoiceRecorder.ts", import.meta.url);

function moduleUrl(source) {
	return "data:text/javascript;base64," + Buffer.from(source).toString("base64");
}

async function loadRecorder() {
	let source = await readFile(recorderUrl, "utf8");
	const vueMock = moduleUrl(
		"export const ref = (value) => ({ value });" +
		"export const onMounted = (callback) => globalThis.__recorderHooks.mounted = callback;" +
		"export const onBeforeUnmount = (callback) => globalThis.__recorderHooks.beforeUnmount = callback;",
	);
	const platformMock = moduleUrl(
		"export const requestNativeMicrophonePermission = () => globalThis.__nativePermission();",
	);
	const waveformMock = moduleUrl(
		"export const normalizeVoiceWaveform = (samples) => [...samples];",
	);
	source = source
		.replace('from "vue"', 'from "' + vueMock + '"')
		.replace('from "../capacitor-platform.ts"', 'from "' + platformMock + '"')
		.replace('from "../voice-message.js"', 'from "' + waveformMock + '"');
	return import(moduleUrl(stripTypeScriptTypes(source)) + "#" + Math.random());
}

function deferred() {
	let resolve;
	const promise = new Promise((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function installRecorderGlobals(getUserMedia) {
	globalThis.__recorderHooks = {};
	globalThis.document = {
		hidden: false,
		addEventListener() {},
		removeEventListener() {},
	};
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: { mediaDevices: { getUserMedia } },
	});
	function FakeMediaRecorder() {}
	FakeMediaRecorder.isTypeSupported = () => true;
	globalThis.MediaRecorder = FakeMediaRecorder;
}

test("录音启动去重，取消授权等待后不会再请求媒体流", async () => {
	const permission = deferred();
	let permissionCalls = 0;
	let mediaCalls = 0;
	globalThis.__nativePermission = () => {
		permissionCalls++;
		return permission.promise;
	};
	installRecorderGlobals(async () => {
		mediaCalls++;
	});
	const { useVoiceRecorder } = await loadRecorder();
	const recorder = useVoiceRecorder();
	const first = recorder.start();
	await recorder.start();
	assert.equal(permissionCalls, 1);
	assert.equal(recorder.starting.value, true);
	await recorder.cancel();
	permission.resolve();
	await first;
	assert.equal(mediaCalls, 0);
	assert.equal(recorder.starting.value, false);
});

test("取消等待中的 getUserMedia 会释放迟到的媒体流", async () => {
	const media = deferred();
	let stopCalls = 0;
	globalThis.__nativePermission = async () => {};
	installRecorderGlobals(() => media.promise);
	const { useVoiceRecorder } = await loadRecorder();
	const recorder = useVoiceRecorder();
	const start = recorder.start();
	await Promise.resolve();
	await recorder.cancel();
	media.resolve({ getTracks: () => [{ stop: () => stopCalls++ }] });
	await start;
	assert.equal(stopCalls, 1);
	assert.equal(recorder.recording.value, false);
});

test("组件卸载会取消等待并释放迟到的媒体流", async () => {
	const media = deferred();
	let stopCalls = 0;
	globalThis.__nativePermission = async () => {};
	installRecorderGlobals(() => media.promise);
	const { useVoiceRecorder } = await loadRecorder();
	const recorder = useVoiceRecorder();
	const start = recorder.start();
	await Promise.resolve();
	globalThis.__recorderHooks.beforeUnmount();
	media.resolve({ getTracks: () => [{ stop: () => stopCalls++ }] });
	await start;
	assert.equal(stopCalls, 1);
	assert.equal(recorder.starting.value, false);
});
