# 首次管理員初始化 / First Administrator Setup

## 中文

**沒有默認管理員密碼，也沒有公開註冊入口。** `worker/schema.sql` 只創建數據庫結構，不創建用戶。`ADMIN_USERNAMES` 僅保留管理員用戶名，不能創建賬號或設置密碼。管理員登錄後，在「註冊邀請」創建用戶或生成邀請鏈接，其他用戶才能註冊。

### GitHub Actions 部署

在自己的倉庫 `Settings -> Secrets and variables -> Actions -> Secrets` 添加：

| Repository Secret | 填寫內容 |
| --- | --- |
| `EDGECHAT_ADMIN_USERNAME` | 自己選擇的管理員用戶名，例如 `admin` |
| `EDGECHAT_ADMIN_PASSWORD` | 自己設置的強密碼，沒有系統默認值 |
| `EDGECHAT_ADMIN_DISPLAY_NAME` | 可選顯示名，默認使用用戶名 |

舊的 `CFCHAT_ADMIN_*` 名稱仍兼容，新名稱優先。重新運行 `Actions -> Deploy Worker -> Run workflow`，賬號初始化成功後，使用上述用戶名和密碼登錄。首次漏配無需重新建庫或重複導入 schema。

已有可登錄超管時，更新不要求再次提供初始化憑據。只配置用戶名或密碼其中一項會報錯；初始化後仍無有效超管，也會停止發佈並給出配置提示。

### 手動部署：SQL 已執行，但無法首次登錄

需要 Node.js 24、已執行 `npm ci`，並已用 `wrangler.example.toml` 準備好自己的 `wrangler.toml`，其中 `DB` 必須指向網站實際綁定的 D1。先完成 schema/遷移，再初始化賬號。Wrangler 使用自己的 Cloudflare 登錄或 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 環境變量。

在項目根目錄執行。密碼通過終端輸入，不寫進源碼、配置或命令歷史。

**PowerShell：**

```powershell
$env:EDGECHAT_ADMIN_USERNAME = 'admin'
$env:EDGECHAT_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host '設置管理員密碼' -AsSecureString)).Password
npm run admin:bootstrap
$bootstrapExit = $LASTEXITCODE
Remove-Item Env:EDGECHAT_ADMIN_PASSWORD
if ($bootstrapExit -ne 0) { throw '管理員 SQL 生成失敗，停止執行' }
# 僅在上一步成功後執行；DB 是 wrangler.toml 中的數據庫 binding。
npx wrangler d1 execute DB --remote --config wrangler.toml --file .tmp/edgechat-admin-upsert.sql
```

**Bash / macOS / Linux：**

```bash
export EDGECHAT_ADMIN_USERNAME=admin
read -r -s -p 'Set administrator password: ' EDGECHAT_ADMIN_PASSWORD
export EDGECHAT_ADMIN_PASSWORD
if npm run admin:bootstrap; then
  unset EDGECHAT_ADMIN_PASSWORD
  # 確認配置指向網站使用的 D1。
  npx wrangler d1 execute DB --remote --config wrangler.toml --file .tmp/edgechat-admin-upsert.sql
else
  unset EDGECHAT_ADMIN_PASSWORD
fi
```

`npm run admin:bootstrap` **只生成 SQL，不修改數據庫**。生成物在 gitignore 的 `.tmp`，只含密碼哈希和隨機鹽，不含明文密碼；執行成功後可刪除這個 SQL 文件。線上數據庫用 `--remote`；本地 `wrangler dev --local` 用 `--local`，不要混用。

網站已部署時，執行管理員 SQL 後即可登錄，無需再次發佈 Worker。尚未部署則繼續 `npm run deploy`。用戶名和密碼必須與生成 SQL 時填寫的值一致。

### 已有同名賬號或忘記密碼

初始化腳本**只創建不存在的賬號**，重複運行不會重置密碼、授予已有普通賬號超管身份、解封或恢復已刪除賬號。修改 Repository Secret 也不會修改已有賬號密碼。忘記密碼或同名普通賬號已存在時，請按 [顯式超管恢復說明](rbac.md#升級與恢復) 先備份並確認目標，再執行恢復工具；不要清空數據庫或開放匿名初始化接口。

## English

**There is no default administrator password and no public sign-up.** `worker/schema.sql` creates tables, not accounts. `ADMIN_USERNAMES` only reserves names; it cannot create an account or set its password. After signing in, an administrator creates users or registration invitation links in the admin panel.

### GitHub Actions

Add `EDGECHAT_ADMIN_USERNAME` (your chosen name, such as `admin`) and `EDGECHAT_ADMIN_PASSWORD` (your own strong password) as Repository Secrets under `Settings -> Secrets and variables -> Actions -> Secrets`. `EDGECHAT_ADMIN_DISPLAY_NAME` is optional. Legacy `CFCHAT_ADMIN_*` names remain supported; new names take precedence.

Run `Actions -> Deploy Worker -> Run workflow` again, then sign in with these credentials. Missing initial credentials do not require recreating the database. Later updates can omit them if an active super administrator already exists. Providing only one credential, or having no active super administrator after initialization, stops deployment with an actionable error.

### Manual Deployment

Use Node.js 24 and run `npm ci`. Complete the schema/migrations and configure your own `wrangler.toml` from the template, ensuring its `DB` binding points to the website's actual D1 database. Authenticate Wrangler using your own Cloudflare login or deployment environment variables.

From the repository root, use the PowerShell or Bash commands above: set `EDGECHAT_ADMIN_USERNAME`, enter `EDGECHAT_ADMIN_PASSWORD` without placing it in shell history, run `npm run admin:bootstrap`, remove the password from the environment, then execute the generated SQL:

```bash
npx wrangler d1 execute DB --remote --config wrangler.toml --file .tmp/edgechat-admin-upsert.sql
```

Only execute SQL if generation succeeded. The npm command generates SQL only; it does not modify D1. The ignored `.tmp` file contains a salted password hash, not the plaintext password; remove it after use. Use `--local` instead of `--remote` for a local Wrangler development database.

If the website is already deployed, sign in immediately after applying the SQL; no Worker redeployment is needed. Otherwise continue with `npm run deploy`. Initial credentials are consumed by the SQL generator, not configured as runtime Worker password variables.

### Existing Accounts and Recovery

Initialization never overwrites an existing account's password, permissions, ban state, deletion state or role. Updating Repository Secrets is not a password reset. For an existing account or lost administrator password, back up the database and follow the explicit recovery procedure in [RBAC maintenance](rbac.md). Do not empty the database or expose anonymous administrator setup.
