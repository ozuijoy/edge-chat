import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const openapi = readFileSync(
	new URL("../docs/api/edgechat-v1.openapi.yaml", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const websocket = readFileSync(
	new URL("../docs/api/websocket-v1.md", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");

test("OpenAPI v1 locks every native HTTP entry point", () => {
	assert.match(openapi, /^openapi: 3\.1\.0/m);
	for (const path of [
		"/capabilities:",
		"/auth/login:",
		"/auth/refresh:",
		"/auth/logout:",
		"/auth/session:",
		"/bootstrap:",
		"/channels:",
		"/dm/open:",
		"/rooms/{kind}/{roomId}/messages:",
		"/rooms/{kind}/{roomId}/sync:",
		"/uploads:",
		"/realtime/tickets:",
	]) {
		assert.match(openapi, new RegExp(`^  ${path.replace(/[{}]/g, "\\$&")}`, "m"), path);
	}
});

test("OpenAPI v1 keeps stable auth, idempotency, sync and error fields", () => {
	for (const field of [
		"accessToken",
		"accessTokenExpiresAt",
		"refreshToken",
		"refreshTokenExpiresAt",
		"clientMessageId",
		"clientUploadId",
		"syncCursor",
		"nextCursor",
			"hasMore",
			"mentionUserIds",
				"mentionUnreadCount",
				"replyMessageId",
				"replyToMessageId",
			"durationMs",
			"waveform",
			"required: [code, message]",
	]) {
		const escaped = field.replaceAll("[", "\\[").replaceAll("]", "\\]");
		assert.match(openapi, new RegExp(escaped));
	}
});

test("WebSocket v1 documents all supported frames and recovery rules", () => {
	assert.match(websocket, /protocolVersion: 1/);
	for (const type of [
		"ready",
		"message",
		"message_deleted",
		"message_pinned",
		"message_unpinned",
		"room_message",
		"error",
	]) {
		assert.match(websocket, new RegExp(`\\b${type}\\b`));
	}
	assert.match(websocket, /1 second, 2 seconds and then 5 seconds/);
	assert.match(websocket, /HTTP room sync endpoint/);
	assert.match(websocket, /mentionsMe/);
	assert.match(websocket, /replyToMe/);
});
