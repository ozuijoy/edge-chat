<div align="center">
  <img src="Edgechat.jpg" alt="EdgeChat" width="640" />

  <h3>自己的聊天空間，不必從維護服務器開始。</h3>
  <p>基於 Cloudflare 的開源自部署團隊聊天系統</p>
  <p>實時群聊與私信 · Telegram 雙向橋接 · 語音與文件 · 消息與附件服務端加密</p>

  <p>
    <img src="https://img.shields.io/github/license/aozorae/Edgechat?style=flat-square&color=blue" alt="license" />
    <img src="https://img.shields.io/github/stars/aozorae/Edgechat?style=flat-square&color=orange" alt="stars" />
    <img src="https://img.shields.io/github/forks/aozorae/Edgechat?style=flat-square" alt="forks" />
    <img src="https://img.shields.io/github/last-commit/aozorae/Edgechat?style=flat-square" alt="last commit" />
    <img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" />
  </p>

  <p>
    <a href="README.md"><b>中文</b></a> ·
    <a href="README.en.md">English</a> ·
    <a href="README.ja.md">日本語</a> ·
    <a href="https://edgechat-demo.wcjxxgaq.workers.dev">在線演示</a> ·
    <a href="https://echat.azora.top/">項目文檔</a> ·
    <a href="https://t.me/EdgeChatlounge">Telegram 社區</a>
  </p>
</div>

<br />

**EdgeChat 是一個運行在 Cloudflare 上的開源團隊聊天系統。** 你可以用它為團隊、項目或小圈子搭建一個獨立的聊天空間：討論放進群組，私事留給私信，語音和文件也能隨手分享。

它不需要你另外維護一臺常駐服務器。應用與數據資源部署在你自己的 Cloudflare 賬號下，通過 GitHub Actions 自動部署和更新。如果成員已經在使用 Telegram，也可以把兩側群組連接起來，繼續使用各自習慣的聊天入口。

[界面預覽](#界面預覽) · [在線演示](#在線演示) · [Telegram 橋接](#telegram-雙向橋接) · [功能特性](#功能特性) · [隱私與加密](#隱私與加密) · [部署](#部署) · [本地開發](#本地開發)

## 界面預覽

<table>
  <tr>
    <td width="50%" align="center"><strong>聊天界面</strong></td>
    <td width="50%" align="center"><strong>管理後臺</strong></td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/previews/chat-home.png" alt="EdgeChat 聊天界面預覽" width="100%" /></td>
    <td width="50%"><img src="assets/previews/admin-dashboard.png" alt="EdgeChat 管理後臺預覽" width="100%" /></td>
  </tr>
</table>

## 在線演示

**[打開 EdgeChat 在線演示 →](https://edgechat-demo.wcjxxgaq.workers.dev)**

先看看界面，再決定是否部署。

演示站複用正式項目的 Vue 頁面、路由、狀態管理和實時消息邏輯，但 API、WebSocket、文件上傳與 Telegram 迴流均在瀏覽器內存中模擬，不是連接真實後端的多人聊天室。

 刷新頁面或點擊右上角「重置演示數據」即可恢復初始狀態。演示操作不會訪問正式 Worker，也不會寫入 D1 或 KV。

<table>
  <tr>
    <td width="50%" valign="top">
      <b>✈️ Telegram 雙向橋接</b><br />
      群組一鍵綁定 Telegram 群，文字、圖片、視頻、語音、文件雙向同步。Telegram 成員無需註冊賬號，消息帶 <code>TG</code> 來源標識。
    </td>
    <td width="50%" valign="top">
      <b>🌐 跨實例群組互聯</b><br />
      兩個獨立部署的 EdgeChat 站點可綁定同一個群，新消息雙向同步。邀請碼一次性、10 分鐘有效，雙方管理員確認後生效。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <b>🤖 WebMCP 站點工具</b><br />
      兼容的 AI 客戶端可直接登錄站點、查詢會話、讀取和發送消息，讓 AI 助手成為聊天室的一等公民。
    </td>
    <td width="50%" valign="top">
      <b>🎙️ 語音溝通</b><br />
      語音消息支持錄製、波形進度與倍速播放；私信支持一對一語音通話，默認 P2P 直連，失敗時自動回落 TURN 中繼。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <b>🔐 消息與附件加密</b><br />
      新消息正文和新上傳附件使用 AES-256-GCM 服務端加密，密鑰版本化管理，支持一鍵增量輪換，舊密文不受影響。
    </td>
    <td width="50%" valign="top">
      <b>🙈 後臺不看正文</b><br />
      管理員後臺不提供任何消息正文的搜索或會話查看入口，只展示消息數量等聚合統計，把隱私邊界做進產品裡。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <b>☁️ 零服務器運維</b><br />
      全部運行在你自己的 Cloudflare 賬號裡。GitHub Actions 自動部署，並可每日檢查上游穩定版與安全更新、自動合併發佈。
    </td>
    <td width="50%" valign="top">
      <b>🛡️ 邀請制與精細管控</b><br />
      不開放自助註冊，由管理員創建賬號或發送邀請；支持永久封禁與按天/時/分鐘設置的臨時封禁，到期自動解除。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <b>🔔 Telegram 離線提醒</b><br />
      成員可在設置中綁定 Bot，網頁關閉時也能收到私信和 @ 提醒，且提醒中不包含消息正文，不洩露內容。
    </td>
    <td width="50%" valign="top">
      <b>🪟 全端一致的體驗</b><br />
      Liquid Glass 風格界面，適配桌面與移動端；支持 PWA 安裝，並提供可自填服務地址的 Android 客戶端。
    </td>
  </tr>
</table>

## Telegram 雙向橋接

> `2.8.0` 起，Telegram 與實例橋接均只轉發本站賬號原創消息；來自另一條橋的消息不會繼續跨橋擴散。

**不用把所有人都搬進同一個應用。**

管理員可以在後臺查看 EdgeChat 的公開與私有群組，並將任一群組與 Telegram 群組綁定。Telegram Bot 會雙向轉發消息：在網頁裡發出的消息可以同步到 Telegram，Telegram 群裡的消息也會回到 EdgeChat；一對一私信不會進入橋接。

適合已經有 Telegram 群、同時又需要一個獨立網頁聊天入口的團隊和社區。

<div align="center">
  <img
    src="https://github.com/user-attachments/assets/eb5d6b5a-4664-41c6-a760-02c4a1398b36"
    alt="EdgeChat 與 Telegram 雙向消息橋接演示"
    width="90%"
  />
  <br />
  <sub>兩個聊天入口，同一段討論。</sub>
</div>


## 隱私與加密

EdgeChat 對**新寫入的消息正文和新上傳的附件**使用 AES-256-GCM 服務端靜態加密。歷史明文數據保持原狀，讀取時兼容新舊數據，不會在部署或後臺任務中批量回填加密。

管理員後臺不提供群組或私信消息正文的查看入口，仍可查看消息數量等聚合統計。

> [!NOTE]
> **這是服務端加密，不是端到端加密。**
> Worker 在通過會話權限校驗後解密內容，Cloudflare 運行環境和掌握密鑰的部署方仍需要被信任。後臺沒有消息查看入口，不代表部署者在技術上無法訪問內容。
>
> 開啟 Telegram 橋接後，被轉發的消息也會進入對應的 Telegram 會話。

<details>
<summary><strong>密鑰管理與輪換說明</strong></summary>

<br />

GitHub Actions 會管理服務端加密 Worker Secrets。首次部署時，如果目標 Worker 尚無加密 Secret，工作流會自動生成隨機 32 字節 AES 密鑰，以獨立的版本化 Secret 注入，並記錄當前 active key ID。後續普通部署只檢查這些 Secret 是否存在，不會重新生成、覆蓋或輪換。

生產環境已經存在的 `EDGECHAT_ENCRYPTION_KEYRING` JSON 密鑰環會被原樣保留並繼續兼容。

需要手動指定密鑰時，可創建名為 `EDGECHAT_ENCRYPTION_KEYRING` 的 GitHub Repository Secret：

```json
{"activeKeyId":"v1","keys":{"v1":"BASE64_ENCODED_32_BYTE_KEY"}}
```

首次部署會直接採用該值。

已有 Worker 需要自動增量輪換時，手動運行 `Deploy Worker` 並勾選 `rotate_encryption_key`。工作流只新增一個版本化密鑰 Secret，並把 active key ID 切換到新版本；所有舊 Secret 和舊 JSON 密鑰環都保持不變。新消息使用新密鑰，舊密文繼續使用各自信封中的 key ID 解密。

`apply_encryption_keyring` 是備用的手動覆蓋入口。使用時，Repository Secret 中必須是完整 JSON 密鑰環，`keys` 需要保留所有仍被歷史密文引用的舊 key ID，再增加新 key 並更新 `activeKeyId`。

**刪除舊 key 會導致對應歷史密文永久無法讀取。** `apply_encryption_keyring` 與 `rotate_encryption_key` 不能在同一次運行中同時啟用。

</details>

## 技術棧

| 部分 | 技術 |
|---|---|
| 前端 | Vue 3、Vue Router、Vite |
| 後端 | Cloudflare Workers、Hono |
| 實時通信 | Durable Objects、WebSocket Hibernation |
| 數據庫 | Cloudflare D1 |
| 會話存儲 | Cloudflare KV |
| 文件存儲 | Cloudflare D1 (BLOB)、備用 R2 |
| 構建與部署 | Wrangler、GitHub Actions |

更多實現說明見 [TECHNICAL.md](TECHNICAL.md)。

## 文件存儲

附件內容與元數據一并存入 Cloudflare D1 的 `uploaded_files` 表（內嵌 BLOB），單文件上限為 **2 MB**，由 `MAX_FILE_SIZE` 控制。D1 寫入為唯一新路徑；刪除即時生效，無需依賴外部桶的補償清理。

如從 R2 遷移而來的歷史對象，其 `data` 列為空、數據仍留在 R2 桶內，服務會在首次下載時從 R2 回退讀取。如需完整遷移這些歷史對象到 D1，可在管理後臺的「存儲統計」中執行掃描，確認無錯誤後向 `/api/admin/files/backfill?cursor=<cursor>` 回填（需 `storage.scan` 授限，限流 10 秒/次）。回填完成後可從 `wrangler.toml` 移除 `[[r2_buckets]]` binding，R2 桶將不再被訪問。

## 部署

**首次登錄：沒有默認管理員密碼，建表 SQL 不會創建賬號，也不開放公開註冊。** Actions 部署請配置 `EDGECHAT_ADMIN_USERNAME` / `EDGECHAT_ADMIN_PASSWORD` Repository Secrets；手動部署請生成並執行管理員初始化 SQL。完整命令及漏配處理見[首次管理員初始化](docs/admin-bootstrap.md)。管理員登錄後可創建用戶或註冊邀請。

### GitHub Actions 自動部署

推薦使用倉庫內置的 GitHub Actions 工作流進行部署和後續更新。`Sync Upstream` 每天檢查兩次，僅自動合併帶 `EdgeChat-Update: stable` / `security` 尾行標記的上游發佈並顯式觸發部署；首次啟用、同步令牌及 `MESSAGE_RETENTION_DAYS` 配置見[自動更新說明](docs/auto-update.md)。

按照文檔完成 Cloudflare 授權與倉庫配置後，可以手動運行 `Deploy Worker`，也可以通過向 `master` 或 `main` 分支推送代碼觸發部署。工作流文件為 `.github/workflows/deploy-worker.yml`。

**[快速開始](https://echat.azora.top/guide/getting-started.html) · [GitHub Actions 部署教程](https://echat.azora.top/guide/actions-deploy.html)**

### 手動部署與 Docker

本地手動部署的資源準備、配置方法和注意事項見 [部署文檔](https://echat.azora.top/guide/getting-started.html)。

Docker 相關說明見 [DOCKER.md](DOCKER.md)。

### Android 客戶端

<details>
<summary>查看客戶端、安裝與構建說明</summary>

<br />

`capacitor/` 客戶端的 APK 內置 Vue Web UI，並通過少量 Kotlin 對接系統文件選擇、通知、麥克風權限、通知會話跳轉和外部鏈接。包名為 `com.aozorae.edgechat.web`，首次登錄時填寫自己的 EdgeChat HTTPS 服務地址，不綁定固定部署。

- 安裝包：從 [GitHub Releases](https://github.com/aozorae/Edgechat/releases) 下載 `edgechat-*.apk`，並核對 `SHA256SUMS.txt`。
- 首次使用：填寫自己的 EdgeChat HTTPS 服務地址、賬號和密碼。
- 本地構建：準備 JDK 21 與 Android SDK 36 後，運行 `npm run build:capacitor`。
- Debug APK：`capacitor/android/app/build/outputs/apk/debug/app-debug.apk`。
- CI：`.github/workflows/capacitor-android-ci.yml` 上傳 `edgechat-capacitor-debug`。
- 發佈：推送 `android-v*` 標籤或手動運行 `Android Release`，使用四個 `ANDROID_KEYSTORE_*` Secrets 構建簽名 APK/AAB。
- 服務切換：退出登錄後可以修改地址；切換實例時自動清理舊實例令牌。

當前不包含 Room 離線數據庫、WorkManager Outbox 或 FCM；應用停止接收消息時，不承諾後臺即時通知。

原生 `android/` Kotlin + Jetpack Compose 客戶端暫時棄用，不再作為默認發行版。源碼、API v1 契約與獨立 CI 暫時保留。

完整說明見 [Android 客戶端文檔](https://echat.azora.top/guide/android.html)。

</details>

## 本地開發

```bash
# 獲取源碼
git clone https://github.com/aozorae/Edgechat.git
cd Edgechat

# 安裝依賴
npm install

# 啟動純前端演示，無需先部署雲端資源
npm run dev:demo
```

連接實際後端進行開發或部署前，請先按照文檔準備對應的 Cloudflare 資源與配置。

```bash
# 前端開發
npm run dev:frontend

# 本地構建
npm run build

# 本地手動發佈
npm run deploy
```

<details>
<summary>演示站構建、部署與 CI 環境變量</summary>

<br />

```bash
# 獨立構建演示站
npm run build:demo

# 部署獨立演示 Worker
npm run deploy:demo
```

演示站使用 `wrangler.demo.toml` 和 `.github/workflows/deploy-demo.yml`，Worker 名稱為 `edgechat-demo`。GitHub Actions 僅支持手動觸發，並讀取 `DEMO_CLOUDFLARE_ACCOUNT_ID`、`DEMO_CLOUDFLARE_API_TOKEN`，不會改變現有生產部署工作流。

在非交互環境下部署時，需要提前設置 `CLOUDFLARE_API_TOKEN`。

後臺更新檢查會在構建時自動記錄當前 GitHub 倉庫、分支和提交。為了獲得準確結果，手動部署應在 Git 倉庫內基於已經推送的乾淨提交構建；源碼倉庫需要保持公開，瀏覽器才能直接調用 GitHub Compare API，整個過程不會創建定時任務。

PowerShell 示例：

```powershell
$env:CLOUDFLARE_API_TOKEN = "your-token"
npm run deploy
```

</details>

## 項目結構

<details>
<summary>查看主要目錄</summary>

```text
Edgechat/
├─ assets/previews/       # 界面預覽
├─ frontend/             # Vue 前端與瀏覽器內演示
├─ worker/
│  ├─ schema.sql         # 數據庫結構
│  ├─ migrations/        # 數據庫遷移
│  └─ src/               # API、認證與 Durable Objects
├─ capacitor/            # 基於 Web UI 的 Android 客戶端
├─ android/              # 暫時保留的原生 Android 客戶端
├─ .github/workflows/    # 自動部署與 CI
├─ wrangler.toml
├─ wrangler.demo.toml
├─ package.json
├─ README.md
├─ README.en.md
├─ README.ja.md
└─ LICENSE
```

</details>

## 交流與貢獻

遇到問題、想討論功能，或者有自己的使用方式，歡迎提交 [Issue](https://github.com/aozorae/Edgechat/issues)，也歡迎加入 [Telegram 社區](https://t.me/EdgeChatlounge)。

代碼、文檔、翻譯與問題反饋都可以幫助項目繼續完善。歡迎提交 Pull Request。

感謝所有為 EdgeChat 提供幫助的貢獻者：

[![貢獻者](https://contrib.rocks/image?repo=aozorae/Edgechat)](https://github.com/aozorae/Edgechat/graphs/contributors)

特別感謝 [@fix221](https://github.com/fix221) 提交 [PWA 支持 PR #31](https://github.com/aozorae/Edgechat/pull/31)。

## Star History

<a href="https://www.star-history.com/?type=date&repos=aozorae%2FEdgechat">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=aozorae/Edgechat&type=date&theme=dark&legend=top-left&sealed_token=GpyqTbdwb3a2OHOT-WlCSoSzrumr3iwtcNluTpGbcU5CuyfP4eKf9TjtDuJ2uY4XK0P6knEB6OFCkbaAMsMCO3vnGPprGvB4f4rd7kmbUNe3fJ8LNaaGVH7JZLDT7SNNy3DC-sBxZwBmfL7gP9AFv1iKX1FgYnRZuOBGcKkbWFlBuoq2TXpYIfWmoUF9" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=aozorae/Edgechat&type=date&legend=top-left&sealed_token=GpyqTbdwb3a2OHOT-WlCSoSzrumr3iwtcNluTpGbcU5CuyfP4eKf9TjtDuJ2uY4XK0P6knEB6OFCkbaAMsMCO3vnGPprGvB4f4rd7kmbUNe3fJ8LNaaGVH7JZLDT7SNNy3DC-sBxZwBmfL7gP9AFv1iKX1FgYnRZuOBGcKkbWFlBuoq2TXpYIfWmoUF9" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=aozorae/Edgechat&type=date&legend=top-left&sealed_token=GpyqTbdwb3a2OHOT-WlCSoSzrumr3iwtcNluTpGbcU5CuyfP4eKf9TjtDuJ2uY4XK0P6knEB6OFCkbaAMsMCO3vnGPprGvB4f4rd7kmbUNe3fJ8LNaaGVH7JZLDT7SNNy3DC-sBxZwBmfL7gP9AFv1iKX1FgYnRZuOBGcKkbWFlBuoq2TXpYIfWmoUF9" />
 </picture>
</a>

## 協議說明

本項目採用 **GNU GPL v3.0 or later**，詳見 [LICENSE](LICENSE)。

## 鳴謝

<div align="center">

### ✨ 特別鳴謝

<table>
<tr>
<td align="center" width="140">
<a href="https://github.com/VenLac">
<img src="https://github.com/VenLac.png" width="100" style="border-radius:50%" alt="VenLac"/>
</a>
</td>
<td>

**[VenLac](https://github.com/VenLac)**（Venlacy）

[![GitHub](https://img.shields.io/badge/GitHub-VenLac-181717?style=flat-square&logo=github)](https://github.com/VenLac)

項目早期貢獻了大量核心代碼，為 EdgeChat 的整體架構奠定了基礎；
同時憑藉自身在社區中的影響力，為項目推廣做出了突出貢獻。讓更多開發者認識並使用了 EdgeChat。

</td>
</tr>
</table>

</div>

<br>

感謝 [linux do](https://linux.do) 在推廣方面為本項目做出的貢獻。

## 免責聲明

EdgeChat 是一個自部署的開源項目。項目維護者僅提供軟件本身，不運營、控制或管理任何由用戶自行部署的實例。

實例的部署者和使用者應自行對其部署方式、使用行為及其中產生的內容和數據負責。

項目維護者不對任何獨立部署實例的使用或濫用承擔責任。
