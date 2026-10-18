import { tokenizeMentionText } from "./mentions.js";

const WEB_LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'，。！？、：；]+/giu;
const SIMPLE_TRAILING_PUNCTUATION = new Set([
	".",
	",",
	"!",
	"?",
	";",
	":",
	"，",
	"。",
	"！",
	"？",
	"、",
	"：",
	"；",
]);
const CLOSING_BRACKETS = new Map([
	[")", "("],
	["]", "["],
	["}", "{"],
]);

function isLinkBoundary(character) {
	return !character || /[\s([{"'，。！？、：；]/u.test(character);
}

function countCharacter(value, character) {
	let count = 0;
	for (const current of value) {
		if (current === character) count += 1;
	}
	return count;
}

function trimLinkEnd(value) {
	let end = value.length;
	while (end > 0) {
		const lastCharacter = value[end - 1];
		if (SIMPLE_TRAILING_PUNCTUATION.has(lastCharacter)) {
			end -= 1;
			continue;
		}

		const openingBracket = CLOSING_BRACKETS.get(lastCharacter);
		if (!openingBracket) break;
		const candidate = value.slice(0, end);
		if (
			countCharacter(candidate, lastCharacter) <=
			countCharacter(candidate, openingBracket)
		) {
			break;
		}
		end -= 1;
	}
	return value.slice(0, end);
}

function linkHref(text) {
	return text.toLowerCase().startsWith("www.") ? `https://${text}` : text;
}

function isWebLink(text) {
	try {
		const url = new URL(linkHref(text));
		return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
	} catch {
		return false;
	}
}

export function tokenizeWebLinks(text) {
	const tokens = [];
	let cursor = 0;

	for (const match of text.matchAll(WEB_LINK_PATTERN)) {
		const offset = match.index;
		if (!isLinkBoundary(text[offset - 1])) continue;

		const linkText = trimLinkEnd(match[0]);
		if (!isWebLink(linkText)) continue;
		if (offset > cursor) {
			tokens.push({ type: "text", text: text.slice(cursor, offset) });
		}
		tokens.push({ type: "link", text: linkText, href: linkHref(linkText) });
		cursor = offset + linkText.length;
	}

	if (cursor < text.length) {
		tokens.push({ type: "text", text: text.slice(cursor) });
	}
	return tokens;
}

export function tokenizeMessageText(content, mentions) {
	return tokenizeMentionText(content, mentions).flatMap((token) =>
		token.type === "text" ? tokenizeWebLinks(token.text) : token,
	);
}
