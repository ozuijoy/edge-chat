# 網站配色 / Site color palette

## 中文

在 **後臺 → 站點外觀 → 網站配色** 點擊 **奶油櫻花粉** 即可保存並應用，點擊 **經典配色** 可以恢復。此操作只提交配色，不會保存旁邊尚未確認的名稱或圖標。

- 超級管理員或擁有「修改站點外觀」權限的管理員可以切換；只讀管理員只能查看。
- 配色作用於整個站點的登錄、註冊、聊天、個人設置及後臺。當前窗口立即生效，其他訪客刷新後生效，不強制刷新正在聊天的頁面。
- 個人自定義背景保留；錯誤、警告、成功與在線提示繼續使用原有語義色。當前網頁只有淺色設計，此功能不是深色模式。
- demo 的配色僅在當前頁面的演示內存中生效，刷新或重置演示即恢復，不會更改生產站點。
- 無需數據庫遷移、環境變量、新資源或 Secret。設置保存在現有 `site_settings` 的 `site_color_theme` 鍵中；缺失時使用 `default`，另一個允許值為 `cream-sakura`。升級仍用現有 GitHub Actions 或 `npm run deploy`，無需手動 SQL。
- 維護入口：共享 TypeScript 預設契約 `shared/site-theme.ts`，全站顏色令牌 `frontend/src/styles/color-themes.css`；新增配色需同步 API 白名單、雙語、色卡和測試。

## English

Open **Admin → Site appearance → Site color palette** and click **Cream Sakura** to save and apply it immediately. Click **Classic palette** to restore the original colors. This action does not save unsaved name or icon edits.

- Super administrators and administrators with the site-appearance update permission can switch palettes; read-only administrators can view them.
- The palette covers login, registration, chat, personal settings and administration. It applies immediately in the current window; other visitors see it after refreshing. Active chats are not forcibly reloaded.
- Personal backgrounds and semantic error, warning, success and online colors remain unchanged. This is a light palette, not a dark-mode feature.
- Demo changes are held in the current page's memory and reset on reload or demo reset; they never affect production.
- No migration, environment variable, resource or Secret is required. The existing `site_settings` table stores `site_color_theme`; absent values use `default`, and the other accepted value is `cream-sakura`. Existing GitHub Actions and `npm run deploy` continue to work without manual SQL.
- Maintain presets in `shared/site-theme.ts` and tokens in `frontend/src/styles/color-themes.css`. New presets require coordinated API validation, translations, swatches and tests.
