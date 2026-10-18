import { ApiError } from '../errors.js';
import { isUserDisabled } from '../user-status.js';
import { getUserBlockStatus } from '../data/user-blocks.ts';

export async function authorizeVoiceCall(db, roomId: number, userId: number) {
  if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new ApiError('无效的私聊', 400);
  const { results } = await db.prepare(`SELECT u.id, u.username, u.display_name,
    u.is_disabled, u.disabled_until, u.deleted_at
    FROM channels c JOIN channel_members m ON m.channel_id = c.id
    JOIN users u ON u.id = m.user_id
    WHERE c.id = ? AND c.kind = 'dm' AND c.deleted_at IS NULL`).bind(roomId).all();
  // 管理员可查看私聊历史，但通话只能由这两个真实成员参与。
  if (results.length !== 2 || !results.some(user => Number(user.id) === userId)) {
    throw new ApiError('仅私聊双方可以通话', 403);
  }
  if (results.some(user => user.deleted_at || isUserDisabled(user))) throw new ApiError('账号已不可用', 403);
  const peer = results.find(user => Number(user.id) !== userId);
  const blocks = await getUserBlockStatus(db, userId, Number(peer.id));
  if (blocks.blockedByMe || blocks.blockedMe) throw new ApiError('拉黑状态下无法通话', 403);
  return { peerId: Number(peer.id), users: results.map(user => ({
    id: Number(user.id), name: user.display_name || user.username
  })) };
}
