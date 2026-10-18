import { createDemoFixtures } from './fixtures.js';

export let demoState = createDemoFixtures();

export function resetDemoState() {
  for (const url of demoState.files.values()) {
    URL.revokeObjectURL?.(url);
  }
  demoState = createDemoFixtures();
}

export function cloneDemo(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function roomKey(kind, roomId) {
  return `${kind}:${Number(roomId)}`;
}

export function findDemoUser(userId) {
  return demoState.users.find((user) => Number(user.id) === Number(userId));
}

export function findDemoChannel(channelId) {
  return demoState.channels.find((channel) => Number(channel.id) === Number(channelId));
}

export function projectDemoUser(user) {
  if (!user) return null;
  const { id, username, displayName, avatarUrl, createdAt } = user;
  const isPermanentlyDisabled = Boolean(user.isPermanentlyDisabled ?? (user.isDisabled && !user.disabledUntil));
  const disabledUntilTimestamp = Date.parse(user.disabledUntil || '');
  const disabledUntil = Number.isFinite(disabledUntilTimestamp) && disabledUntilTimestamp > Date.now()
    ? user.disabledUntil
    : null;
  return {
    id,
    username,
    displayName,
    avatarUrl,
    isDisabled: isPermanentlyDisabled || Boolean(disabledUntil),
    isPermanentlyDisabled,
    disabledUntil,
    createdAt
  };
}

export function projectDemoChannel(channel) {
  if (!channel) return null;
  const {
    memberIds: _memberIds,
    ownerId: _ownerId,
    createdAt: _createdAt,
    ...projection
  } = channel;
  return cloneDemo(projection);
}

export function projectDemoDm(dm, viewerUserId = demoState.session.userId) {
	if (!dm) return null;
	const peerUserId = dm.participantIds.find(
		(userId) => Number(userId) !== Number(viewerUserId)
	);
	const otherUser = findDemoUser(peerUserId) || dm.otherUser;
	return {
		id: dm.id,
		kind: 'dm',
		otherUser: projectDemoUser(otherUser),
		lastMessageAt: dm.lastMessageAt,
		unreadCount: dm.unreadCount,
		mentionUnreadCount: Number(dm.mentionUnreadCount || 0),
		isBlockedByMe: isDemoUserBlocked(viewerUserId, otherUser.id)
	};
}

function userBlockKey(blockerId, blockedId) {
	return `${Number(blockerId)}:${Number(blockedId)}`;
}

export function isDemoUserBlocked(blockerId, blockedId) {
	return demoState.userBlocks.has(userBlockKey(blockerId, blockedId));
}

export function setDemoUserBlocked(blockerId, blockedId, blocked) {
	const key = userBlockKey(blockerId, blockedId);
	if (blocked) demoState.userBlocks.add(key);
	else demoState.userBlocks.delete(key);
}

export function getDemoDirectMessageBlockStatus(dmId, senderId) {
	const dm = demoState.dms.find((item) => Number(item.id) === Number(dmId));
	const peerId = dm?.participantIds.find((userId) => Number(userId) !== Number(senderId));
	return {
		blockedBySender: Boolean(peerId && isDemoUserBlocked(senderId, peerId)),
		blockedByPeer: Boolean(peerId && isDemoUserBlocked(peerId, senderId))
	};
}

export function getDemoMembers(channel) {
	  return channel.memberIds
	    .map((userId) => findDemoUser(userId))
	    .filter(Boolean)
	    .map((user) => ({
	      ...projectDemoUser(user),
	      isAdmin: Boolean(user.isAdmin),
	      role: Number(user.id) === Number(channel.ownerId) ? 'owner' : 'member',
	      joinedAt: channel.createdAt
	    }));
}

export function createDemoMessage({
	kind,
	roomId,
	content,
	attachment,
	sender,
	mentionUserIds = [],
	replyMessageId = null,
}) {
	const normalizedMentionUserIds = [...new Set(mentionUserIds.map(Number))];
	const key = roomKey(kind, roomId);
	const replyTarget = replyMessageId
		? (demoState.messages[key] || []).find((item) => Number(item.id) === Number(replyMessageId))
		: null;
	const message = {
    id: demoState.nextMessageId++,
    content: String(content || ''),
    createdAt: new Date().toISOString(),
    sender: cloneDemo(sender),
    attachment: attachment ? cloneDemo(attachment) : null,
    mentionUserIds: normalizedMentionUserIds,
    mentions: normalizedMentionUserIds
      .map((userId) => findDemoUser(userId))
      .filter(Boolean)
      .map((user) => ({
        userId: Number(user.id),
        username: user.username,
        displayName: user.displayName
					}))
	};
	if (replyTarget) {
		message.replyToMessageId = Number(replyTarget.id);
		message.replyTo = {
			id: Number(replyTarget.id),
			deleted: false,
			content: replyTarget.content,
			sender: cloneDemo(replyTarget.sender),
			attachment: replyTarget.attachment ? cloneDemo(replyTarget.attachment) : null,
		};
	}
  demoState.messages[key] ||= [];
  demoState.messages[key].push(message);

  const room = kind === 'dm'
    ? demoState.dms.find((dm) => Number(dm.id) === Number(roomId))
    : findDemoChannel(roomId);
  if (room) {
    room.lastMessageAt = message.createdAt;
  }
  return message;
}

export function getDemoFileUrl(keyOrUrl) {
  const raw = String(keyOrUrl || '');
  if (!raw) return '';
  return demoState.files.get(raw) || raw;
}

export function storeDemoFile(file) {
  const key = `demo/${Date.now()}-${encodeURIComponent(file.name || 'file')}`;
  const url = URL.createObjectURL(file);
  demoState.files.set(key, url);
  return {
    key,
    url,
    name: file.name || 'file',
    type: file.type || 'application/octet-stream',
    size: Number(file.size || 0)
  };
}
