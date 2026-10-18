# 网站配色 / Site color palette

## 中文

在 **后台 → 站点外观 → 网站配色** 点击 **奶油樱花粉** 即可保存并应用，点击 **经典配色** 可以恢复。此操作只提交配色，不会保存旁边尚未确认的名称或图标。

- 超级管理员或拥有「修改站点外观」权限的管理员可以切换；只读管理员只能查看。
- 配色作用于整个站点的登录、注册、聊天、个人设置及后台。当前窗口立即生效，其他访客刷新后生效，不强制刷新正在聊天的页面。
- 个人自定义背景保留；错误、警告、成功与在线提示继续使用原有语义色。当前网页只有浅色设计，此功能不是深色模式。
- demo 的配色仅在当前页面的演示内存中生效，刷新或重置演示即恢复，不会更改生产站点。
- 无需数据库迁移、环境变量、新资源或 Secret。设置保存在现有 `site_settings` 的 `site_color_theme` 键中；缺失时使用 `default`，另一个允许值为 `cream-sakura`。升级仍用现有 GitHub Actions 或 `npm run deploy`，无需手动 SQL。
- 维护入口：共享 TypeScript 预设契约 `shared/site-theme.ts`，全站颜色令牌 `frontend/src/styles/color-themes.css`；新增配色需同步 API 白名单、三语言、色卡和测试。

## English

Open **Admin → Site appearance → Site color palette** and click **Cream Sakura** to save and apply it immediately. Click **Classic palette** to restore the original colors. This action does not save unsaved name or icon edits.

- Super administrators and administrators with the site-appearance update permission can switch palettes; read-only administrators can view them.
- The palette covers login, registration, chat, personal settings and administration. It applies immediately in the current window; other visitors see it after refreshing. Active chats are not forcibly reloaded.
- Personal backgrounds and semantic error, warning, success and online colors remain unchanged. This is a light palette, not a dark-mode feature.
- Demo changes are held in the current page's memory and reset on reload or demo reset; they never affect production.
- No migration, environment variable, resource or Secret is required. The existing `site_settings` table stores `site_color_theme`; absent values use `default`, and the other accepted value is `cream-sakura`. Existing GitHub Actions and `npm run deploy` continue to work without manual SQL.
- Maintain presets in `shared/site-theme.ts` and tokens in `frontend/src/styles/color-themes.css`. New presets require coordinated API validation, translations, swatches and tests.
