export type MentionUser = {
	id: number;
	username: string;
	displayName?: string;
};

export type MessageMention = {
	userId: number;
	username: string;
	displayName?: string;
};

export type MentionTextToken =
	| { type: "text"; text: string }
	| { type: "mention"; text: string; userId: number };

export {
	contentMentionsUsername,
	resolveMentionUserIds,
	tokenizeMentionText,
} from "./mentions.js";
