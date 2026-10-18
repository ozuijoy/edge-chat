import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
	tokenizeMessageText,
	tokenizeWebLinks,
} from "../frontend/src/message-text.js";

const messageMarkdownComponent = readFileSync(
	new URL("../frontend/src/components/chat/MessageMarkdown.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");

test("消息正文识别网页链接并保留句末标点", () => {
	const content = "文档：https://example.com/docs?q=chat。备用 www.example.org/path_(v2)。";
	const tokens = tokenizeWebLinks(content);

	assert.equal(tokens.map((token) => token.text).join(""), content);
	assert.deepEqual(
		tokens.filter((token) => token.type === "link"),
		[
			{
				type: "link",
				text: "https://example.com/docs?q=chat",
				href: "https://example.com/docs?q=chat",
			},
			{
				type: "link",
				text: "www.example.org/path_(v2)",
				href: "https://www.example.org/path_(v2)",
			},
		],
	);
});

test("消息链接与结构化提及可以同时分段", () => {
	const content = "@alice 看 https://example.com，javascript:alert(1) 保持为文本";
	const tokens = tokenizeMessageText(content, [{ userId: 2, username: "alice" }]);

	assert.equal(tokens.map((token) => token.text).join(""), content);
	assert.deepEqual(tokens.map((token) => token.type), ["mention", "text", "link", "text"]);
	assert.equal(tokens.some((token) => token.type === "link" && token.href.startsWith("javascript:")), false);
});

test("残缺网址保持为普通文本而不是站内相对链接", () => {
	for (const content of ["www..", "https://.", "prefixwww.example.com"]) {
		assert.deepEqual(tokenizeWebLinks(content), [{ type: "text", text: content }]);
	}
});

test("消息链接使用新标签页并保留浏览器原生右键菜单", () => {
	const renderer = readFileSync(
		new URL("../frontend/src/message-markdown.ts", import.meta.url),
		"utf8",
	);
	assert.match(renderer, /class=\\?"message-link/);
	assert.match(renderer, /target=\\?"_blank/);
	assert.match(renderer, /rel=\\?"noopener noreferrer/);
	assert.match(messageMarkdownComponent, /@pointerdown="stopLinkGesture"/);
	assert.match(messageMarkdownComponent, /@contextmenu="stopLinkGesture"/);
});
