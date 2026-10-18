import assert from "node:assert/strict";
import test from "node:test";

import {
	forwardInboxConnection,
	forwardRoomConnection,
	forwardVerifiedRequest,
	notifyUserInbox,
} from "../worker/src/do-bridge.js";

function createNamespaceHarness() {
	const captures = [];
	const namespace = {
		idFromName(name) {
			captures.push({ type: "name", name });
			return `id:${name}`;
		},
		get(id) {
			captures.push({ type: "get", id });
			return {
				async fetch(input, init) {
					const request = input instanceof Request ? input : new Request(input, init);
					captures.push({ type: "request", request });
					return new Response("ok");
				},
			};
		},
	};
	return { namespace, captures };
}

test("room bridge 拥有 DO 寻址、连接 URL 与 verified metadata", async () => {
	const channel = createNamespaceHarness();
	const env = { CHANNEL_ROOM: channel.namespace };
	const principal = { userId: 7, isAdmin: true, token: "session-token" };

	await forwardRoomConnection({
		env,
		request: new Request("https://example.com/api/ws?keep=1"),
		kind: "private",
		roomId: "12",
		principal,
	});

	assert.deepEqual(channel.captures.slice(0, 2), [
		{ type: "name", name: "private:12" },
		{ type: "get", id: "id:private:12" },
	]);
	const forwarded = channel.captures[2].request;
	const url = new URL(forwarded.url);
	assert.equal(url.pathname, "/connect");
	assert.equal(url.searchParams.get("kind"), "private");
	assert.equal(url.searchParams.get("id"), "12");
	assert.equal(url.searchParams.get("token"), "session-token");
	assert.equal(url.searchParams.get("keep"), "1");
	assert.equal(forwarded.headers.get("x-cfchat-internal-auth"), "worker-verified");
	assert.equal(forwarded.headers.get("x-cfchat-verified-user-id"), "7");
	assert.equal(forwarded.headers.get("x-cfchat-verified-is-admin"), "1");
	assert.ok(Number(forwarded.headers.get("x-cfchat-verified-at")) > 0);
});

test("inbox bridge 按用户寻址，notify 使用固定内部协议", async () => {
	const inbox = createNamespaceHarness();
	const env = { USER_INBOX: inbox.namespace };

	await forwardInboxConnection({
		env,
		request: new Request("https://example.com/api/inbox"),
		principal: { userId: "9", isAdmin: false, token: "token" },
	});
	await notifyUserInbox(env, "9", { type: "room_message", messageId: 3 });

	assert.equal(inbox.captures[0].name, "user:9");
	assert.equal(new URL(inbox.captures[2].request.url).pathname, "/connect");
	assert.equal(inbox.captures[3].name, "user:9");
	const notifyRequest = inbox.captures[5].request;
	assert.equal(new URL(notifyRequest.url).pathname, "/notify");
	assert.equal(notifyRequest.method, "POST");
	assert.equal(notifyRequest.headers.get("x-cfchat-internal-auth"), "worker-verified");
	assert.equal(notifyRequest.headers.get("content-type"), "application/json");
	assert.deepEqual(await notifyRequest.json(), { type: "room_message", messageId: 3 });
});

test("通用 bridge 转发非 GET 请求体且不依赖流式 duplex", async () => {
	let forwarded;
	const stub = {
		async fetch(request) {
			forwarded = request;
			return new Response("ok");
		},
	};
	await forwardVerifiedRequest({
		stub,
		request: new Request("https://example.com/source", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ value: 1 }),
		}),
		pathname: "/target",
		principal: { userId: 2, isAdmin: false },
	});

	assert.equal(forwarded.method, "POST");
	assert.equal(new URL(forwarded.url).pathname, "/target");
	assert.deepEqual(await forwarded.json(), { value: 1 });
});
