export const ADMIN_PERMISSIONS = [
  ['dashboard.read', 'dashboard', '查看儀表盤', '僅聚合數量和狀態'],
  ['users.read', 'users', '查看用戶', '基礎資料、賬號狀態與管理身份'],
  ['users.create', 'users', '創建用戶', '僅創建普通賬號', 'users.read'],
  ['users.profile.update', 'users', '編輯用戶資料', '僅未受保護普通用戶的顯示名', 'users.read'],
  ['users.ban', 'users', '封禁和解封', '僅未受保護普通用戶', 'users.read'],
  ['users.delete', 'users', '刪除用戶', '僅未受保護普通用戶', 'users.read', 'high'],
  ['users.login_history.read', 'users', '查看登錄記錄', '僅未受保護普通用戶的 IP、UA 與登錄時間', 'users.read', 'sensitive'],
  ['invites.read', 'invites', '查看註冊邀請', '狀態與次數，不含可用邀請憑據'],
  ['invites.create', 'invites', '創建註冊邀請', '普通用戶邀請及有效鏈接憑據', 'invites.read'],
  ['invites.revoke', 'invites', '撤銷註冊邀請', '不改變受邀賬號的權限', 'invites.read'],
  ['channels.read', 'channels', '查看群組清單', '僅群組元數據，不含消息或成員明細'],
  ['channels.delete', 'channels', '刪除群組', '系統 general 群不可刪除', 'channels.read', 'high'],
  ['storage.read', 'storage', '查看存儲統計', '用量摘要，不含對象路徑或文件正文'],
  ['storage.scan', 'storage', '掃描存儲', '每頁最多 1000 個對象，單用戶限速', 'storage.read'],
  ['site.read', 'site', '查看站點外觀', '公開名稱、圖標與配色，不含安全配置'],
  ['site.appearance.update', 'site', '修改站點外觀', '僅名稱、合法圖標和預設配色', 'site.read'],
  ['telegram.read', 'telegram', '查看 Telegram 橋接', '子管理員僅查看自己擁有的群'],
  ['telegram.mappings.manage', 'telegram', '管理 Telegram 映射', '子管理員必須是目標群主，不含 Bot 憑據', 'telegram.read', 'high'],
  ['instance_bridge.read', 'instance_bridge', '查看實例橋接', '子管理員僅查看自己擁有的群'],
  ['instance_bridge.manage', 'instance_bridge', '管理實例橋接', '子管理員必須是目標群主', 'instance_bridge.read', 'high'],
  ['maintenance.read', 'maintenance', '查看健康摘要', '脫敏狀態，不含完整診斷'],
].map(([key, module, name, description, dependency, risk]) => ({
  key: key!, module: module!, name: name!, description: description!,
  dependencies: dependency ? [dependency] : [], risk: risk || 'normal',
}));

export const PERMISSION_KEYS = ADMIN_PERMISSIONS.map((p) => p.key);
export type Authorization = { isSuperAdmin?: boolean; canAccessAdmin?: boolean; permissions?: string[] };
export function hasPermission(auth: Authorization | null | undefined, key: string) {
  return PERMISSION_KEYS.includes(key) && Boolean(auth?.isSuperAdmin || auth?.permissions?.includes(key));
}
export function validatePermissions(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((key) => typeof key === 'string' &&
    ADMIN_PERMISSIONS.some((p) => p.key === key && p.dependencies.every((d) => value.includes(d))));
}
export function togglePermission(current: string[], key: string, enabled: boolean) {
  const selected = new Set(current);
  if (enabled) {
    selected.add(key);
    for (const dependency of ADMIN_PERMISSIONS.find((p) => p.key === key)?.dependencies || []) selected.add(dependency);
  } else {
    selected.delete(key);
    for (const permission of ADMIN_PERMISSIONS) if (permission.dependencies.includes(key)) selected.delete(permission.key);
  }
  return PERMISSION_KEYS.filter((permission) => selected.has(permission));
}
