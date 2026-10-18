import { cloneDemo, demoState } from './state.js';
import { demoOwnsGroup } from './rbac.ts';

export function demoInstanceBridge(path, method, body) {
  const channels = demoState.channels.filter((c) => c.kind !== 'dm' && demoOwnsGroup(c.id));
  if (!demoState.instanceBindings) demoState.instanceBindings = [];
  const bindings = demoState.instanceBindings;
  const state = () => cloneDemo({ channels: channels.map(({ id, name, kind }) => ({ id, name, kind })), bindings: bindings.filter((b) => demoOwnsGroup(b.channelId)),
    instance: { id: 'demo-local', origin: 'https://edgechat.demo' } });
  const room = path.match(/^\/channels\/(\d+)\/instance-bridge$/);
  if (room) return cloneDemo({ binding: bindings.find((b) => b.channelId === Number(room[1]) && b.status !== 'revoked') || null });
  if (path === '/admin/instance-bridge' && method === 'GET') return state();
  if (path === '/admin/instance-bridge/invitations' || path === '/admin/instance-bridge/accept') {
    const channel = channels.find((c) => c.id === Number(body.channelId));
    if (!channel || bindings.some((b) => b.channelId === channel.id && b.status !== 'revoked')) throw new Error('请选择未绑定的群组');
    const creating = path.endsWith('/invitations');
    const id = crypto.randomUUID();
    const expiresAt = Date.now() + 600_000;
    // 只演示管理员交互，不解析真实凭据，也不对输入中的任何地址发请求。
    bindings.unshift({ id, channelId: channel.id, channelName: channel.name,
      role: creating ? 'inviter' : 'joiner', status: creating ? 'pending' : 'active',
      peerOrigin: 'https://peer.edgechat.demo', peerChannelName: 'EdgeChat Community', peerInstanceId: 'demo-peer',
      localPaused: false, peerPaused: false, controlPending: false, queued: 0, delivered: 0, discarded: 0, expiresAt });
    return creating ? { id, invitation: JSON.stringify({ demo: true, bindingId: id }), expiresAt } : { id };
  }
  const match = path.match(/^\/admin\/instance-bridge\/([^/]+)\/actions$/);
  if (match) {
    const b = bindings.find((entry) => entry.id === match[1]);
    if (!b) throw new Error('绑定不存在');
    if (body.action === 'confirm') b.status = 'active';
    if (body.action === 'pause' || body.action === 'resume') b.localPaused = body.action === 'pause';
    if (body.action === 'unlink') b.status = 'revoked';
    return state();
  }
  return null;
}
