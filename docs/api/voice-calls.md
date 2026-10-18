# 私聊语音通话（2.11.0）

仅网页一对一私聊，群聊、视频、SFU 与 Android 不在本版范围。双方需要在线并留在聊天工作区（可切换私聊、群聊与通讯录）；离开工作区、退出或关闭页面会结束通话。来电 45 秒超时，单次通话最多 1 小时。锁屏、浏览器进程停止或网络挂起后不保证来电与持续通话。

## 连接与隐私

私聊顶栏电话图标旁选择 `P2P` 或 `TURN`。P2P 使用 Cloudflare STUN；约 12 秒未连通时重新协商 TURN。TURN 模式强制 `iceTransportPolicy: relay`，不是给直连列表附加一个备用地址。切换会短暂中断声音，保留麦克风、静音状态与通话时长。

浏览器 WebRTC 负责音频加密与传输；Worker / VoiceCall DO 只传递 SDP、ICE 和通话控制，不转发或保存音频。P2P 会向对方暴露网络候选地址；希望只走中继可在呼叫前选择 TURN。SDP/ICE 不写入聊天记录，短期 TURN 凭据只发给已接听通话的实际参与窗口。

## Cloudflare TURN 配置

Cloudflare 当前 [Realtime 定价](https://developers.cloudflare.com/realtime/sfu/platform/pricing/)：SFU 与 TURN 每月共享前 1,000 GB 免费出站流量，超出 $0.05/GB；Worker、D1、KV 与 DO 另外计量。该额度不是每个 TURN Key 各自拥有 1,000 GB，也不是无限免费。

在目标账户创建或复用 TURN Key。通过官方 API 创建时，Cloudflare 管理 Token 需要 `Calls Write` 权限。创建接口：`POST /accounts/{account_id}/calls/turn_keys`，请求体 `{"name":"edgechat-voice"}`。保管返回的 `uid` 与 `key`；已有 Key 不能回读长期秘密，丢失时应在面板确认后创建新 Key，不要重复部署就创建 Key。

将两项长期信息注入 Worker Secret，禁止放入前端、源码或 wrangler 明文配置：

```bash
npx wrangler secret put EDGECHAT_TURN_KEY_ID
npx wrangler secret put EDGECHAT_TURN_API_TOKEN
```

`EDGECHAT_TURN_KEY_ID` 是 TURN Key 的 `uid`；`EDGECHAT_TURN_API_TOKEN` 是该 Key 返回的 `key`，不是用于部署的 `CLOUDFLARE_API_TOKEN`。Worker 调用 `https://rtc.live.cloudflare.com/v1/turn/keys/{uid}/credentials/generate-ice-servers` 生成 3,600 秒短期凭据，每个通话参与者复用一次签发，结束后删除 DO 缓存。

GitHub Actions 用户在 Repository Secrets 添加相同的两项名称；必须成对配置。工作流在部署后通过 `wrangler secret put` 注入。未提供时保留已有 Worker Secrets；新安装没有 TURN 配置时只能 P2P，连接失败会明确报错，不会假装已切换中继。

保留 `wrangler.example.toml` 中的 `VOICE_CALL` binding 与 `v4` / `VoiceCall` SQLite DO 迁移，正常 Actions 自动部署它们；已有 D1 / KV / R2 复用，没有 D1 schema 变更。demo 不申请真实凭据、不采集麦克风或建立真实通话。

## 控制协议

- `GET /api/calls/:roomId/config`：仅 DM 双方，返回 STUN 与 `turnAvailable`。
- `POST /api/calls/:roomId/action`：带 `type/callId/clientId`；`start/accept/restart` 带 `mode: auto|relay`；`offer/answer/ice` 带当前 `revision`，以及 `sdp` 或 `candidate`。其他动作是 `reject/hangup/heartbeat`。
- `GET /api/calls/:roomId/ice?callId=...&clientId=...`：仅已接听且占用该窗口的参与者，返回临时 ICE 配置，响应 `Cache-Control: no-store`。
- Inbox 帧：`call_invite/call_negotiate/call_signal/call_ended`，都有 `callId/roomId`；协商与信令带 `revision`。客户端必须按自己的用户与窗口 ID 过滤。

每个 API 动作重新校验会话、DM 两人成员、双方有效状态及双向拉黑。管理员的历史查看权限不赋予参与通话权。Inbox 发送通话帧前重新验证对应会话；旧版无会话元数据连接不接收通话信令，但原聊天推送继续保留。

每个私聊的 DO 串行控制通话，每个用户的 Inbox 以事务维护一个通话席位，避免跨私聊并发。双方约 25 秒心跳一次；缺任意一方心跳 75 秒，或封禁/拉黑后的 alarm 复验失败，会终止通话并释放席位。席位有独立截止时间，异常停止不会永久占用。

## 验收

两个真实账号、不同网络分别检查 P2P 双向声音、麦克风授权/拒绝、接听/拒绝/无人接听、静音、挂断、自动 TURN 回退与手动双向切换。多窗口只允许一个接听；拉黑双方不得发起或继续协商。手机还需核对浏览器自动播放、后台限制与网络切换，不将本地模拟音频测试视为真实设备验收。
