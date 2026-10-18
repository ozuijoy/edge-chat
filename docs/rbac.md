# 用戶組與後臺權限（2.14.1）

用戶組是後臺權限組，與聊天群組無關。首版每人一組，無繼承、疊加或個人授權。固定普通組無後臺權限，新建和邀請註冊默認進入普通組。超管身份來自獨立 `users.is_super_admin`，組名或全選權限不能產生超管。

## 使用與邊界

超管在「用戶組與權限」創建組，按模塊勾選權限，再從用戶列表或組成員頁分配賬號；創建用戶也可直接選組。勾選寫權限自動帶上讀取依賴，取消讀取同時取消依賴操作。組可停用，停用只撤銷後臺能力，不封禁聊天。有成員（含軟刪除賬號）的組不能刪除，先遷移成員。

子管理員僅能管理未受保護的普通賬號，不能重置他人密碼、修改登錄身份、分組或安全配置。曾任管理員的賬號降回普通組仍受保護，超管可明確解除保護。最後一名有效超管不能被刪除、永久/臨時封禁或降級；後臺禁止自我刪除/封禁。

用戶組修改與成員分配使用版本衝突檢測，409 時刷新後重新確認，不自動覆蓋。撤權不自動銷燬既有邀請與橋接，分組成功會提示剩餘資源，超管需另行復核。

**單獨的產品變化**：後臺身份不再賦予讀取非成員私有群/私信、下載其中附件、群管理或置頂/刪除消息的能力，HTTP、v1 和舊 WebSocket 均按真實成員/群主判斷。公開資源沿用原規則。子管理員橋接須為群主；超管保留之前的全站橋接操作，沒有同時引入“超管也必須群主”的新要求。部署者及能恢復賬號的超管仍在信任邊界內，不承諾端到端保密。

## 維護入口

- `shared/admin-permissions.ts`：21 個穩定權限 key、名稱、說明、依賴和風險；前後端共用。全選保存明確 key，升級新增權限不會自動加入舊組。
- `worker/src/rbac/policies.ts`：接口 method/path、所需全部權限、字段白名單與目標範圍；未知後臺路由默認拒絕，測試核驗路由覆蓋。
- `worker/src/rbac/authorization.ts`：權威快照、統一範圍與 `runAuthorizedBatch`；既有數據層通過 `authorizedDatabase` 複用事務授權，不各寫一套規則。
- `frontend/src/authorization.ts`：頁面與目錄權限關聯；按鈕使用同一 key，模塊只發起已授權請求。

新增功能只需登記目錄權限、接口策略（包括字段與範圍）、頁面/按鈕關聯和對應測試。不增加舊 `isAdmin` 兜底。兼容 `isAdmin/is_admin` 只代表超管，子管理員入口使用 `canAccessAdmin`。

後臺每請求從 D1 主庫讀取最新身份/組/權限，只在請求內複用，不緩存跨請求的允許決策。寫入同一個 D1 batch 內以約束失敗中止整批，業務、版本和審計原子提交。普通聊天不加載後臺權限集合。通知最多喚醒 100 個組成員，漏通知時仍由服務端拒絕，前端在恢復前臺/403/切換路由時刷新。

撤權提交後開始的授權檢查會拒絕已撤能力；寫事務也複驗。已完成響應無法收回。Telegram 等外部網絡副作用不屬於 D1 事務，先接受意圖並記錄審計，網絡失敗沿用業務錯誤/補償；已持久接受任務不保證因隨後撤權而取消。存儲掃描每頁 1000、最多 100 頁、每賬號每分鐘一次開始；超過上限本輪不發佈完整快照。審計不保存憑據/正文，無網頁刪除入口；追加時最多清理 100 條，保留最近 90 天且最多約 10000 條，過期積壓漸進淘汰。

## 升級與恢復

新安裝尚無任何賬號時，先完成[首次管理員初始化](admin-bootstrap.md)，不要使用已有賬號恢復工具代替首次創建。沒有默認管理員密碼，`ADMIN_USERNAMES` 不能創建賬號。

發佈前備份 D1，核對舊 `is_admin=1` 賬號和有效狀態。公開基線該字段只代表全權管理員；若自行改造過子管理員，必須先自行辨別，不能直接運行本映射。遷移保留封禁、刪除、密碼和業務數據，不自動解封。

GitHub Actions 沿用 `prepare-d1-migrations.mjs` 規劃、執行及 `--verify`，先遷移再發布。新裝由全量 schema 初始化並登記基線；舊實例執行 `2026-10-06-rbac` 一次。**不要直接重複執行原始 ALTER SQL**，遷移 ledger/checksum 負責冪等，重複部署不會從舊標記重新提權，也不會覆蓋已配置權限。無新增資源/Secret，不修改 Android。

手動部署使用已有環境中的 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`EDGECHAT_D1_DATABASE_ID`：

```bash
npx wrangler d1 export cfchat-db --remote --output .tmp/rbac-backup.sql
node .github/scripts/prepare-d1-migrations.mjs
npx wrangler d1 execute cfchat-db --remote --file .tmp/edgechat-d1-migrations.sql
node .github/scripts/prepare-d1-migrations.mjs --verify
npm run deploy
```

管理員初始化只在賬號不存在時創建；相同用戶名已存在時不改密碼、身份、封禁或分組。沒有有效超管時，部署者先備份並確認恢復目標為自己的賬號，通過環境變量提供已有用戶 ID 和新密碼：

```bash
node .github/scripts/generate-admin-recovery-sql.mjs --confirm-super-admin-recovery
npx wrangler d1 execute cfchat-db --remote --file .tmp/edgechat-admin-recovery.sql
```

工具讀取 `EDGECHAT_RECOVER_USER_ID` 與 `EDGECHAT_RECOVER_PASSWORD`，只生成本地 SQL，不自動部署；顯式執行會恢復該賬號為超管、普通組、可登錄狀態，並使舊會話失效及寫審計。不要在網頁或普通 CI 自動執行恢復工具。不要把密碼或部署 Token 寫入源碼/配置，生成物僅放 gitignore 的 `.tmp`。

緊急止損可由超管停用管理組。優先前向修復；不要回退至不理解 RBAC 的舊代碼，它會恢復舊聊天管理員放行語義。

首版按產品收斂後置批量分組、複製組、獨立權限預覽與二次密碼驗證；基礎組管理、單用戶分配、即時撤權和審計已實現。

`2.14.1` 的掃描入口為 `POST /api/admin/storage/scan`（空 JSON body，游標仍用 query），以保證快照寫入沿用 Cookie 同源校驗；舊 GET 入口拒絕。後臺錯誤響應也使用 `private, no-store`。該補丁無新遷移。
