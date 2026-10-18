# 定時同步穩定版與安全更新

`Sync Upstream` 每天 UTC 01:17、13:17（北京時間 09:17、21:17）檢查 `aozorae/Edgechat` 默認分支；GitHub 調度可能延遲。上游主倉跳過自身，fork/源碼副本更新自己的默認分支。

## 部署者首次配置

1. 先手動同步一次，確保默認分支已有 `.github/workflows/sync-upstream.yml`。
2. 在 Actions 中啟用工作流。GitHub 默認禁用新 fork 的定時任務；公開倉庫 60 天無活動也可能暫停定時運行，需要重新啟用。
3. 推薦添加 Repository Secret `EDGECHAT_SYNC_TOKEN`：使用僅授權當前 fork 的 fine-grained PAT，授予 **Contents: Read and write**、**Workflows: Read and write**。它僅用於 checkout/推送；派發部署使用內置 `GITHUB_TOKEN` 的 Actions 寫權限。Classic PAT 對應 `repo` 和 `workflow` 權限，但範圍更大，不推薦。
4. 保留原有 Cloudflare Secrets/倉庫變量，允許工作流寫入默認分支。分支保護、組織策略及令牌過期可能阻止同步，不會強推繞過保護。
5. 手動運行一次 `Actions -> Sync Upstream -> Run workflow` 檢查配置，之後由定時任務執行。要停用自動更新，直接 Disable workflow。

未配置同步令牌時，普通源碼更新使用內置令牌；更新涉及 Actions 文件時會明確失敗，要求配置上述 Secret，遠端分支不變。

## 維護者如何標記提交

發佈時照常更新 `package.json`、`package-lock.json` 和變更記錄。發佈提交在正文末尾加一個獨立 Git trailer（與標題/正文之間留空行）：

```bash
# 穩定版本
git commit -m "release: stable version" -m "EdgeChat-Update: stable"
git push origin master

# 必須跟進的安全修復
git commit -m "fix: critical security vulnerability" -m "EdgeChat-Update: security"
git push origin master
```

只識別小寫 `stable` 和 `security`，兩者都會自動合併、部署。正文裡隨意提到標記不算參數。標記須最終保留在上游默認分支第一父鏈的提交裡：使用 squash/merge PR 時，把它放在最終 squash/merge commit 的尾部，而不只是 PR 標題或分支內部提交。

檢查選擇**最新標記提交**，一次合併它及此前全部落後提交，帶入該提交中的版本號。標記之後尚未發佈的開發提交不會被順帶部署。自定義源碼採用普通 merge 保留，衝突必須手動解決；“強制安全更新”不是覆蓋用戶代碼、繞過權限或數據庫回滾。

## 為什麼同步後仍能部署

內置 `GITHUB_TOKEN` 推送不會觸發新的 `push` 工作流，因此腳本顯式通過 `workflow_dispatch` 派發 `Deploy Worker`，從更新後的默認分支拉取代碼、測試、遷移並部署。自動合併提交帶 `[skip ci]`，即使配置 PAT 也不會額外啟動 push 部署；該標記不會阻止顯式 dispatch。

當前 SHA 已成功部署或有部署正在運行時不重複派發；派發失敗、部署失敗或取消後，下次檢查會補派。部署記錄 fork 當前 SHA，不會記錄同步前的舊 SHA。請在 Actions 中分別查看 `Sync Upstream` 和 `Deploy Worker`，同步成功不代表後續部署已成功。

## 自動清除消息天數

Worker 環境變量 `MESSAGE_RETENTION_DAYS` 默認 `7`，請填寫正整數（例如 `30`）。GitHub Actions 部署者在 **Settings -> Secrets and variables -> Actions -> Variables** 添加同名 Repository Variable，然後運行 `Deploy Worker`；每次部署都會讀取它，因此上游同步不會重置該設置。它不是 Secret。

手動部署在 Wrangler 配置的 `[vars]` 中設置 `MESSAGE_RETENTION_DAYS = "30"`，再部署。Cloudflare 面板也可修改 Worker 的同名文本變量併發布，但 Actions 後續部署以 Repository Variable 為準，未配置則恢復 7 天。只在本機導出同名環境變量不會自動傳入線上 Worker。

每天約 UTC 19:00（北京時間次日 03:00）清理超過保留期的消息與關聯附件，按預算分批處理，不保證一輪清完。時間按消息創建時間計算，不按最後查看時間。`0` 不是關閉開關：Worker 對無效值、非正數及小於一天的值回退 7 天；Actions 對非正整數直接報錯。縮短保留期會在下一次清理刪除更早消息，刪除不可恢復，之後改大天數也不能找回。

參考：[GITHUB_TOKEN 與 dispatch 例外](https://docs.github.com/en/actions/concepts/security/github_token)、[跳過 push 工作流](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)、[令牌權限](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)。
