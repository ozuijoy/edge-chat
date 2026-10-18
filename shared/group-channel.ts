export const GROUP_CHANNEL_KINDS = ["public", "private"] as const;

export type GroupChannelKind = (typeof GROUP_CHANNEL_KINDS)[number];

export function isGroupChannelKind(kind: unknown): kind is GroupChannelKind {
	return kind === "public" || kind === "private";
}
