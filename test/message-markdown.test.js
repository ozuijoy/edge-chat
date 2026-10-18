import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
	messageMarkdownToPlainText,
	renderMessageMarkdownHtml,
} from "../frontend/src/message-markdown.ts";

test("消息 Markdown 支持聊天所需的常用块级与行内语法", () => {
	const html = renderMessageMarkdownHtml(`
# 标题

**粗体** *斜体* ~~删除~~ [链接](https://example.com)

> 引用

- 列表

| A | B |
| - | - |
| 1 | 2 |

\`行内代码\`

\`\`\`js
const answer = 42;
\`\`\`
`);

	for (const tag of [
		"<h1>",
		"<strong>",
		"<em>",
		"<s>",
		"<blockquote>",
		"<ul>",
		"<table>",
		"<code>",
		'<pre><code class="language-js">',
	]) {
		assert.ok(html.includes(tag), `缺少 Markdown 输出 ${tag}`);
	}
	assert.match(html, /<a [^>]*href="https:\/\/example\.com"[^>]*>链接<\/a>/);
	assert.match(html, /class="message-link"/);
	assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test("提及与自动链接只进入普通文本 token", () => {
	const html = renderMessageMarkdownHtml(
		"Hi @alice www.example.com `@alice https://code.example` [@alice](https://link.example)",
		[{ userId: 2, username: "alice" }],
		2,
	);

	assert.equal((html.match(/class="message-mention/g) || []).length, 1);
	assert.match(html, /message-mention message-mention--self[^>]*>@alice<\/span>/);
	assert.match(html, /<code>@alice https:\/\/code\.example<\/code>/);
	assert.match(html, />@alice<\/a>/);
	assert.equal((html.match(/href=/g) || []).length, 2);
});

test("原始 HTML 和危险协议保持为文本，远程图片只生成安全链接", () => {
	const html = renderMessageMarkdownHtml(
		'<script>alert(1)</script> [bad](JaVaScRiPt:alert(1)) ![说明](https://images.example/a.png) ![bad](data:text/html,x)',
	);

	assert.doesNotMatch(html, /<script|<img|href="(?:javascript|data|vbscript):/i);
	assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
	assert.match(html, /class="message-link message-image-link" href="https:\/\/images\.example\/a\.png"/);
	assert.match(html, /!\[bad\]\(data:text\/html,x\)/);
});

test("回复、置顶与通知摘要提取纯文本而不携带 Markdown 标记", () => {
	assert.equal(
		messageMarkdownToPlainText(
			"## **发布** [说明](https://example.com)\n\n```js\nconst ready = true;\n```",
		),
		"发布 说明 const ready = true;",
	);
});

test("最终消息渲染固定经过 DOMPurify 最小白名单", () => {
	const source = readFileSync(
		new URL("../frontend/src/message-markdown.ts", import.meta.url),
		"utf8",
	);
	assert.match(source, /DOMPurify\.sanitize\(renderMessageMarkdownHtml/);
	assert.match(source, /ADD_URI_SAFE_ATTR:\s*\["target", "rel"\]/);
	assert.match(source, /ALLOW_DATA_ATTR:\s*false/);
	assert.match(source, /ALLOWED_URI_REGEXP:\s*\/\^https\?:/);
	assert.doesNotMatch(source.match(/const ALLOWED_TAGS = \[[\s\S]*?\];/)?.[0] || "", /"img"|"iframe"/);
});
