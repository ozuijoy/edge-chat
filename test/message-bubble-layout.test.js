import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chatPage = readFileSync(
	new URL("../frontend/src/pages/ChatPage.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const messageRow = readFileSync(
	new URL("../frontend/src/components/chat/MessageRow.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const messageList = readFileSync(
	new URL("../frontend/src/components/chat/MessageList.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const avatarComponent = readFileSync(
	new URL("../frontend/src/components/ui/Avatar.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const replyPreview = readFileSync(
	new URL("../frontend/src/components/chat/MessageReplyPreview.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const messageMarkdown = readFileSync(
	new URL("../frontend/src/components/chat/MessageMarkdown.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const senderTitle = readFileSync(
	new URL("../frontend/src/components/chat/SenderTitleBadge.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const memberPanel = readFileSync(
	new URL("../frontend/src/components/chat/MemberPanel.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");

function getStyleRule(selector) {
	const marker = `${selector} {`;
	const start = messageRow.indexOf(marker);
	assert.notEqual(start, -1, `聊天頁缺少樣式規則：${selector}`);
	const end = messageRow.indexOf("}", start + marker.length);
	assert.notEqual(end, -1, `聊天頁樣式規則未閉合：${selector}`);
	return messageRow.slice(start, end + 1);
}

test("短文本消息為右下角時間戳預留末行空間", () => {
	assert.match(
		messageRow,
		/'message-bubble--with-attachment': msg\.attachment/,
	);
	assert.match(
		messageList,
		/:highlighted="Number\(highlightedMessageId\) === Number\(msg\.id\)"/,
	);

	const bubble = getStyleRule(".message-bubble");
	assert.match(bubble, /padding:\s*10px 12px 8px;/);

	const attachmentBubble = getStyleRule(".message-bubble--with-attachment");
	assert.match(attachmentBubble, /padding-bottom:\s*20px;/);

	const time = getStyleRule(".message-time");
	assert.match(time, /position:\s*absolute;/);
	assert.match(time, /white-space:\s*nowrap;/);

	assert.match(
		messageMarkdown,
		/\.message-markdown::after\s*{[^}]*display:\s*inline-block;[^}]*width:\s*3\.5em;/s,
	);
});

test("非本人消息在氣泡前顯示圓形發送者頭像", () => {
	assert.match(messageRow, /<button\s+v-if="!own"/);
	assert.match(messageRow, /class="profile-avatar-trigger message-avatar-trigger"/);
	assert.match(messageRow, /<UiAvatar class="message-avatar"/);
	assert.match(messageRow, /:src="msg\.sender\.avatarUrl"/);
	assert.match(messageRow, /:fallback="msg\.sender\.displayName"/);

	const row = getStyleRule(".message-row");
	assert.match(row, /align-items:\s*flex-end;/);
	assert.match(row, /gap:\s*10px;/);

	const avatar = getStyleRule(".message-avatar");
	assert.match(avatar, /width:\s*34px;/);
	assert.match(avatar, /height:\s*34px;/);
	assert.match(avatar, /border-radius:\s*50%;/);
});

test("遠程頭像加載失敗時顯示姓名縮寫", () => {
	assert.match(avatarComponent, /const showImage = computed/);
	assert.match(avatarComponent, /failedSrc\.value !== props\.src/);
	assert.match(avatarComponent, /@error="handleImageError"/);
});

test("群聊姓名旁按禁言優先級顯示 Telegram 式頭銜", () => {
	assert.match(messageRow, /<SenderTitleBadge :identity="msg\.sender" \/>/);
	assert.match(memberPanel, /<SenderTitleBadge :identity="member" \/>/);
	assert.ok(senderTitle.indexOf("identity?.isDisabled") < senderTitle.indexOf("identity?.isAdmin"));
	assert.match(senderTitle, /sender-title--administrator/);
	assert.match(senderTitle, /sender-title--muted/);
	assert.match(senderTitle, /border-radius:\s*3px;/);
});

test("回覆氣泡顯示引用預覽並複用消息定位能力", () => {
	assert.match(messageRow, /<MessageReplyPreview/);
	assert.match(messageRow, /@reveal="emit\('reveal', msg\.replyToMessageId\)"/);
	assert.match(chatPage, /@reveal="revealMessage"/);
	assert.match(chatPage, /:replying-to="replyingTo"/);
	assert.match(replyPreview, /border-left:\s*3px solid var\(--site-brand, #008069\);/);
	assert.match(replyPreview, /messages\.replyDeleted/);
});
