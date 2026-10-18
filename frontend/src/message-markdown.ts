import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import type { MessageMention } from "./mentions.ts";
import { tokenizeMessageText } from "./message-text.ts";

type MarkdownEnvironment = {
	mentions?: MessageMention[];
	currentUserId?: number;
};

const ALLOWED_TAGS = [
	"a",
	"blockquote",
	"br",
	"code",
	"del",
	"em",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"li",
	"ol",
	"p",
	"pre",
	"s",
	"span",
	"strong",
	"table",
	"tbody",
	"td",
	"th",
	"thead",
	"tr",
	"ul",
];
const ALLOWED_ATTRIBUTES = ["class", "href", "rel", "target"];

function isSafeWebUrl(value: string) {
	try {
		const url = new URL(value);
		return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
	} catch {
		return false;
	}
}

const markdown = new MarkdownIt({
	breaks: true,
	html: false,
	linkify: false,
	typographer: false,
});

markdown.validateLink = isSafeWebUrl;

markdown.core.ruler.after("inline", "edgechat-message-text", (state) => {
	const environment = state.env as MarkdownEnvironment;
	for (const blockToken of state.tokens) {
		if (blockToken.type !== "inline" || !blockToken.children) continue;

		let linkDepth = 0;
		const children = [];
		for (const token of blockToken.children) {
			if (token.type === "link_open") linkDepth += 1;
			if (token.type !== "text" || linkDepth > 0) {
				children.push(token);
			} else {
				for (const part of tokenizeMessageText(token.content, environment.mentions || [])) {
					if (part.type === "text") {
						const textToken = new state.Token("text", "", 0);
						textToken.content = part.text;
						children.push(textToken);
						continue;
					}

					const customToken = new state.Token(`edgechat_${part.type}`, "", 0);
					customToken.content = part.text;
					customToken.meta = {
						...part,
						self:
							part.type === "mention" &&
							Number(part.userId) === Number(environment.currentUserId),
					};
					children.push(customToken);
				}
			}
			if (token.type === "link_close") linkDepth -= 1;
		}
		blockToken.children = children;
	}
});

markdown.renderer.rules.link_open = (tokens, index, options, _environment, renderer) => {
	const token = tokens[index];
	token.attrSet("class", "message-link");
	token.attrSet("target", "_blank");
	token.attrSet("rel", "noopener noreferrer");
	return renderer.renderToken(tokens, index, options);
};

markdown.renderer.rules.image = (tokens, index) => {
	const token = tokens[index];
	const source = token.attrGet("src") || "";
	const label = token.content || source;
	const escapedLabel = markdown.utils.escapeHtml(label);
	if (!isSafeWebUrl(source)) {
		return `<span class="message-image-syntax">${markdown.utils.escapeHtml(`![${label}](${source})`)}</span>`;
	}
	return `<a class="message-link message-image-link" href="${markdown.utils.escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${escapedLabel}</a>`;
};

markdown.renderer.rules.edgechat_mention = (tokens, index) => {
	const token = tokens[index];
	const classes = token.meta.self
		? "message-mention message-mention--self"
		: "message-mention";
	return `<span class="${classes}">${markdown.utils.escapeHtml(token.content)}</span>`;
};

markdown.renderer.rules.edgechat_link = (tokens, index) => {
	const token = tokens[index];
	return `<a class="message-link" href="${markdown.utils.escapeHtml(token.meta.href)}" target="_blank" rel="noopener noreferrer">${markdown.utils.escapeHtml(token.content)}</a>`;
};

export function renderMessageMarkdownHtml(
	content: string,
	mentions: MessageMention[] = [],
	currentUserId?: number,
) {
	return markdown.render(content, { mentions, currentUserId } satisfies MarkdownEnvironment);
}

export function renderMessageMarkdown(
	content: string,
	mentions: MessageMention[] = [],
	currentUserId?: number,
) {
	return DOMPurify.sanitize(renderMessageMarkdownHtml(content, mentions, currentUserId), {
		ADD_URI_SAFE_ATTR: ["target", "rel"],
		ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
		ALLOWED_TAGS,
		ALLOW_DATA_ATTR: false,
		ALLOWED_URI_REGEXP: /^https?:\/\//i,
	});
}

export function messageMarkdownToPlainText(content: string) {
	const parts: string[] = [];
	for (const token of markdown.parse(String(content || ""), {})) {
		if (token.type === "fence" || token.type === "code_block") {
			parts.push(token.content);
			continue;
		}
		for (const child of token.children || []) {
			if (child.type === "text" || child.type === "code_inline" || child.type === "image") {
				parts.push(child.content);
			} else if (child.type === "softbreak" || child.type === "hardbreak") {
				parts.push("\n");
			}
		}
		if (token.type === "inline") parts.push("\n");
	}
	return parts.join("").replace(/\s+/gu, " ").trim();
}
