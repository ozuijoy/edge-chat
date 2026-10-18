import assert from "node:assert/strict";
import test from "node:test";

import {
	createRealtimeSession,
	parseRealtimeFrame,
} from "../frontend/src/realtime-session.js";

function createSocketHarness() {
	const sockets = [];
	function openConnection(params, handlers) {
		const socket = {
			params,
			handlers,
			readyState: 0,
			closeCalls: 0,
			sent: [],
			close() {
				this.closeCalls += 1;
				this.readyState = 3;
			},
			send(data) {
				this.sent.push(data);
			},
			emitStatus(event) {
				if (event.status === "open") {
					this.readyState = 1;
				}
				if (event.status === "closed") {
					this.readyState = 3;
				}
				this.handlers.onStatus(event);
			},
			emitMessage(payload) {
				this.handlers.onMessage(payload, this);
			},
		};
		sockets.push(socket);
		return socket;
	}

	return { openConnection, sockets };
}

test("同一 key 在連接建立前重複 connect 只創建一條連接", () => {
	const harness = createSocketHarness();
	const session = createRealtimeSession({ openConnection: harness.openConnection });

	session.connect("room:1", { roomId: 1 });
	session.connect("room:1", { roomId: 1 });

	assert.equal(harness.sockets.length, 1);
	assert.equal(harness.sockets[0].closeCalls, 0);
});

test("切換 key 會關閉尚未建立的舊連接並丟棄舊事件", () => {
	const harness = createSocketHarness();
	const messages = [];
	const session = createRealtimeSession({
		openConnection: harness.openConnection,
		onMessage(payload) {
			messages.push(payload);
		},
	});

	session.connect("room:1", { roomId: 1 });
	const oldSocket = harness.sockets[0];
	session.connect("room:2", { roomId: 2 });
	const currentSocket = harness.sockets[1];

	assert.equal(oldSocket.closeCalls, 1);
	oldSocket.emitStatus({ status: "open" });
	oldSocket.emitMessage(JSON.stringify({ id: "stale" }));
	currentSocket.emitStatus({ status: "open" });
	currentSocket.emitMessage(JSON.stringify({ id: "current" }));

	assert.deepEqual(messages, [{ id: "current" }]);
	assert.equal(session.isOpenFor("room:2"), true);
});

test("協議解析集中處理 JSON、文本與二進制幀", () => {
	assert.deepEqual(parseRealtimeFrame('{"type":"message","id":1}'), {
		type: "message",
		id: 1,
	});
	assert.deepEqual(parseRealtimeFrame("plain text"), {
		type: "system",
		message: "plain text",
	});
	const bytes = new TextEncoder().encode('{"type":"pong"}');
	assert.deepEqual(parseRealtimeFrame(bytes.buffer), { type: "pong" });
	assert.deepEqual(parseRealtimeFrame(bytes.subarray(0)), { type: "pong" });
});

test("同步 open/message 回調不會因 transport 初始化時序丟失", () => {
	const messages = [];
	const statuses = [];
	const session = createRealtimeSession({
		openConnection(_params, handlers) {
			const socket = {
				readyState: 1,
				close() {},
				send() {},
			};
			handlers.onStatus({ status: "open", socket });
			handlers.onMessage('{"type":"ready"}', socket);
			return socket;
		},
		onStatus(event) {
			statuses.push(event.status);
		},
		onMessage(message) {
			messages.push(message);
		},
	});

	session.connect("room:1");
	assert.deepEqual(statuses, ["connecting", "open"]);
	assert.deepEqual(messages, [{ type: "ready" }]);
	assert.equal(session.isOpenFor("room:1"), true);
});

test("send 只向當前已打開連接發送", () => {
	const harness = createSocketHarness();
	const session = createRealtimeSession({ openConnection: harness.openConnection });
	session.connect("room:1");
	assert.equal(session.send("before-open", "room:1"), false);
	harness.sockets[0].emitStatus({ status: "open" });
	assert.equal(session.send("hello", "room:1"), true);
	assert.deepEqual(harness.sockets[0].sent, ["hello"]);
});

test("新連接打開後才關閉仍在服務的舊連接", () => {
	const harness = createSocketHarness();
	const session = createRealtimeSession({ openConnection: harness.openConnection });

	session.connect("room:1");
	const oldSocket = harness.sockets[0];
	oldSocket.emitStatus({ status: "open" });
	session.connect("room:2");
	const currentSocket = harness.sockets[1];

	assert.equal(oldSocket.closeCalls, 0);
	currentSocket.emitStatus({ status: "open" });
	assert.equal(oldSocket.closeCalls, 1);
});

test("策略關閉碼不重連，網絡關閉會重連", async () => {
	const harness = createSocketHarness();
	const session = createRealtimeSession({
		openConnection: harness.openConnection,
		reconnectDelays: [0],
	});

	session.connect("room:1");
	harness.sockets[0].emitStatus({ status: "open" });
	harness.sockets[0].emitStatus({ status: "closed", code: 4403 });
	await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(harness.sockets.length, 1);

	session.connect("room:1");
	harness.sockets[1].emitStatus({ status: "open" });
	harness.sockets[1].emitStatus({ status: "closed", code: 1006 });
	await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(harness.sockets.length, 3);
});

test("disconnect 會取消待執行的重連", async () => {
	const harness = createSocketHarness();
	const session = createRealtimeSession({
		openConnection: harness.openConnection,
		reconnectDelays: [5],
	});

	session.connect("room:1");
	harness.sockets[0].emitStatus({ status: "open" });
	harness.sockets[0].emitStatus({ status: "closed", code: 1006 });
	session.disconnect();
	await new Promise((resolve) => setTimeout(resolve, 15));

	assert.equal(harness.sockets.length, 1);
	assert.equal(session.isOpenFor("room:1"), false);
});
