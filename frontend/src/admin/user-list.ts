type UserIdentity = { displayName: string; username: string };

// 後端按頁返回賬號；僅篩選當前頁，避免把局部結果誤稱為全站搜索。
export function filterAdminUsers<T extends UserIdentity>(users: T[], query: string): T[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return users;
  return users.filter((user) => `${user.displayName}\n@${user.username}`.toLowerCase().includes(keyword));
}
