import type { MentionTextToken } from "./mentions.ts";

export type MessageLinkToken = {
	type: "link";
	text: string;
	href: string;
};

export type MessageTextToken = MentionTextToken | MessageLinkToken;

export { tokenizeMessageText, tokenizeWebLinks } from "./message-text.js";
