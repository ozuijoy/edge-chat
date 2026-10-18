import assert from "node:assert/strict";
import test from "node:test";

import {
	resolveMentionUserIds,
	tokenizeMentionText,
} from "../frontend/src/mentions.js";

test("网页端发送只提交正文中仍存在的提及", () => {
	const users = [
		{ id: 2, username: "alice", displayName: "Alice" },
		{ id: 3, username: "bob", displayName: "Bob" },
	];
	assert.deepEqual(resolveMentionUserIds("@alice hi", users, 1), [2]);
	assert.deepEqual(resolveMentionUserIds("mail@alice.test", users, 1), []);
});

test("消息正文按服务端 mention metadata 分段且保留原文", () => {
	const tokens = tokenizeMentionText("Hi @alice and @bob.", [
		{ userId: 2, username: "alice" },
		{ userId: 3, username: "bob" },
	]);
	assert.equal(tokens.map((token) => token.text).join(""), "Hi @alice and @bob.");
	assert.deepEqual(
		tokens.filter((token) => token.type === "mention").map((token) => token.userId),
		[2, 3],
	);
});
