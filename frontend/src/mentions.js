function isMentionBoundary(character) {
	return !character || /[\s()[\]{}<>"'，。！？、：；,.!?]/u.test(character);
}

export function contentMentionsUsername(content, username) {
	const token = `@${username}`;
	let offset = content.indexOf(token);
	while (offset !== -1) {
		const before = offset > 0 ? content[offset - 1] : "";
		const after = content[offset + token.length] || "";
		if (isMentionBoundary(before) && isMentionBoundary(after)) {
			return true;
		}
		offset = content.indexOf(token, offset + token.length);
	}
	return false;
}

export function resolveMentionUserIds(content, users, currentUserId) {
	return users
		.filter(
			(user) =>
				Number(user.id) !== Number(currentUserId) &&
				contentMentionsUsername(content, user.username),
		)
		.map((user) => Number(user.id));
}

export function tokenizeMentionText(content, mentions) {
	const sortedMentions = [...mentions]
		.filter((mention) => mention.username)
		.sort((left, right) => right.username.length - left.username.length);
	const tokens = [];
	let cursor = 0;

	while (cursor < content.length) {
		let nextOffset = -1;
		let nextMention = null;
		for (const mention of sortedMentions) {
			const token = `@${mention.username}`;
			let offset = content.indexOf(token, cursor);
			while (offset !== -1) {
				const before = offset > 0 ? content[offset - 1] : "";
				const after = content[offset + token.length] || "";
				if (isMentionBoundary(before) && isMentionBoundary(after)) {
					break;
				}
				offset = content.indexOf(token, offset + token.length);
			}
			if (offset !== -1 && (nextOffset === -1 || offset < nextOffset)) {
				nextOffset = offset;
				nextMention = mention;
			}
		}

		if (!nextMention || nextOffset === -1) {
			tokens.push({ type: "text", text: content.slice(cursor) });
			break;
		}
		if (nextOffset > cursor) {
			tokens.push({ type: "text", text: content.slice(cursor, nextOffset) });
		}
		const text = `@${nextMention.username}`;
		tokens.push({ type: "mention", text, userId: Number(nextMention.userId) });
		cursor = nextOffset + text.length;
	}

	return tokens;
}
