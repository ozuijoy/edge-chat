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

test("只有內部標記但沒有 principal 字段時拒絕解析身份", () => {
	const request = new Request("https://cfchat.internal/notify", {
		headers: createInternalHeaders(),
	});

	assert.equal(isVerifiedInternalRequest(request), true);
	assert.equal(parseVerifiedPrincipal(request), null);
});

test("外部請求不能偽裝為已驗證身份", () => {
	const request = new Request("https://example.com/connect", {
		headers: {
			"x-cfchat-verified-user-id": "42",
			"x-cfchat-verified-is-admin": "1",
			"x-cfchat-verified-at": String(Date.now()),
		},
	});

	assert.equal(parseVerifiedPrincipal(request), null);
});
