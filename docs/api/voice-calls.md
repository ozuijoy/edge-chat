# 私聊語音通話（2.11.0）

僅網頁一對一私聊，群聊、視頻、SFU 與 Android 不在本版範圍。雙方需要在線並留在聊天工作區（可切換私聊、群聊與通訊錄）；離開工作區、退出或關閉頁面會結束通話。來電 45 秒超時，單次通話最多 1 小時。鎖屏、瀏覽器進程停止或網絡掛起後不保證來電與持續通話。

## 連接與隱私

私聊頂欄電話圖標旁選擇 `P2P` 或 `TURN`。P2P 使用 Cloudflare STUN；約 12 秒未連通時重新協商 TURN。TURN 模式強制 `iceTransportPolicy: relay`，不是給直連列表附加一個備用地址。切換會短暫中斷聲音，保留麥克風、靜音狀態與通話時長。

瀏覽器 WebRTC 負責音頻加密與傳輸；Worker / VoiceCall DO 只傳遞 SDP、ICE 和通話控制，不轉發或保存音頻。P2P 會向對方暴露網絡候選地址；希望只走中繼可在呼叫前選擇 TURN。SDP/ICE 不寫入聊天記錄，短期 TURN 憑據只發給已接聽通話的實際參與窗口。

## Cloudflare TURN 配置

Cloudflare 當前 [Realtime 定價](https://developers.cloudflare.com/realtime/sfu/platform/pricing/)：SFU 與 TURN 每月共享前 1,000 GB 免費出站流量，超出 $0.05/GB；Worker、D1、KV 與 DO 另外計量。該額度不是每個 TURN Key 各自擁有 1,000 GB，也不是無限免費。

在目標賬戶創建或複用 TURN Key。通過官方 API 創建時，Cloudflare 管理 Token 需要 `Calls Write` 權限。創建接口：`POST /accounts/{account_id}/calls/turn_keys`，請求體 `{"name":"edgechat-voice"}`。保管返回的 `uid` 與 `key`；已有 Key 不能回讀長期秘密，丟失時應在面板確認後創建新 Key，不要重複部署就創建 Key。

將兩項長期信息注入 Worker Secret，禁止放入前端、源碼或 wrangler 明文配置：

```bash
npx wrangler secret put EDGECHAT_TURN_KEY_ID
npx wrangler secret put EDGECHAT_TURN_API_TOKEN
```

`EDGECHAT_TURN_KEY_ID` 是 TURN Key 的 `uid`；`EDGECHAT_TURN_API_TOKEN` 是該 Key 返回的 `key`，不是用於部署的 `CLOUDFLARE_API_TOKEN`。Worker 調用 `https://rtc.live.cloudflare.com/v1/turn/keys/{uid}/credentials/generate-ice-servers` 生成 3,600 秒短期憑據，每個通話參與者複用一次簽發，結束後刪除 DO 緩存。

GitHub Actions 用戶在 Repository Secrets 添加相同的兩項名稱；必須成對配置。工作流在部署後通過 `wrangler secret put` 注入。未提供時保留已有 Worker Secrets；新安裝沒有 TURN 配置時只能 P2P，連接失敗會明確報錯，不會假裝已切換中繼。

保留 `wrangler.example.toml` 中的 `VOICE_CALL` binding 與 `v4` / `VoiceCall` SQLite DO 遷移，正常 Actions 自動部署它們；已有 D1 / KV / R2 複用，沒有 D1 schema 變更。demo 不申請真實憑據、不採集麥克風或建立真實通話。

## 控制協議

- `GET /api/calls/:roomId/config`：僅 DM 雙方，返回 STUN 與 `turnAvailable`。
- `POST /api/calls/:roomId/action`：帶 `type/callId/clientId`；`start/accept/restart` 帶 `mode: auto|relay`；`offer/answer/ice` 帶當前 `revision`，以及 `sdp` 或 `candidate`。其他動作是 `reject/hangup/heartbeat`。
- `GET /api/calls/:roomId/ice?callId=...&clientId=...`：僅已接聽且佔用該窗口的參與者，返回臨時 ICE 配置，響應 `Cache-Control: no-store`。
- Inbox 幀：`call_invite/call_negotiate/call_signal/call_ended`，都有 `callId/roomId`；協商與信令帶 `revision`。客戶端必須按自己的用戶與窗口 ID 過濾。

每個 API 動作重新校驗會話、DM 兩人成員、雙方有效狀態及雙向拉黑。管理員的歷史查看權限不賦予參與通話權。Inbox 發送通話幀前重新驗證對應會話；舊版無會話元數據連接不接收通話信令，但原聊天推送繼續保留。

每個私聊的 DO 串行控制通話，每個用戶的 Inbox 以事務維護一個通話席位，避免跨私聊併發。雙方約 25 秒心跳一次；缺任意一方心跳 75 秒，或封禁/拉黑後的 alarm 複驗失敗，會終止通話並釋放席位。席位有獨立截止時間，異常停止不會永久佔用。

## 驗收

兩個真實賬號、不同網絡分別檢查 P2P 雙向聲音、麥克風授權/拒絕、接聽/拒絕/無人接聽、靜音、掛斷、自動 TURN 回退與手動雙向切換。多窗口只允許一個接聽；拉黑雙方不得發起或繼續協商。手機還需核對瀏覽器自動播放、後臺限制與網絡切換，不將本地模擬音頻測試視為真實設備驗收。
