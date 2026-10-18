import assert from "node:assert/strict";
import test from "node:test";

import {
	createInternalHeaders,
	createVerifiedPrincipalHeaders,
	isVerifiedInternalRequest,
	parseVerifiedPrincipal,
	parseVerifiedUserId,
} from "../worker/src/verified-identity.js";

test("verified principal headers 可以完整 roundtrip", () => {
	const headers = createVerifiedPrincipalHeaders(
		{ "content-type": "application/json" },
		{ userId: 42, isAdmin: true },
	);
	const request = new Request("https://cfchat.internal/connect", { headers });

	assert.equal(isVerifiedInternalRequest(request), true);
	assert.deepEqual(parseVerifiedPrincipal(request), { userId: 42, isAdmin: true });
	assert.equal(parseVerifiedUserId(request), 42);
	assert.equal(headers.get("content-type"), "application/json");
});

test("只有内部标记但没有 principal 字段时拒绝解析身份", () => {
	const request = new Request("https://cfchat.internal/notify", {
		headers: createInternalHeaders(),
	});

	assert.equal(isVerifiedInternalRequest(request), true);
	assert.equal(parseVerifiedPrincipal(request), null);
});

test("外部请求不能伪装为已验证身份", () => {
	const request = new Request("https://example.com/connect", {
		headers: {
			"x-cfchat-verified-user-id": "42",
			"x-cfchat-verified-is-admin": "1",
			"x-cfchat-verified-at": String(Date.now()),
		},
	});

	assert.equal(parseVerifiedPrincipal(request), null);
});
