# Edgechat Docker 一鍵部署

## 🚀 一鍵啟動（推薦）

```bash
EDGECHAT_ADMIN_PASSWORD='請替換為強密碼' ./docker-start.sh
```

這個腳本會自動：
- ✅ 構建並啟動 Docker 容器
- ✅ 初始化數據庫表
- ✅ 使用與 GitHub Actions 相同的 PBKDF2 規則創建管理員賬戶
- ✅ 顯示訪問信息

## 📱 訪問應用

啟動後訪問：**http://localhost:8788**

## 🔐 管理員賬戶

- **用戶名**：讀取 `EDGECHAT_ADMIN_USERNAME`，未設置時使用 `admin`
- **密碼**：必須通過 `EDGECHAT_ADMIN_PASSWORD` 顯式傳入
- **顯示名稱**：讀取 `EDGECHAT_ADMIN_DISPLAY_NAME`，未設置時使用 `Administrator`

腳本不會把密碼寫入倉庫或固定在啟動文件中。重複運行會複用已有管理員，不會覆蓋現有密碼。

## 🛠️ 手動部署

### 1. 啟動容器

```bash
docker compose up -d --build
```

### 2. 初始化數據庫

```bash
docker compose exec edgechat wrangler d1 execute cfchat-db --local --file=./worker/schema.sql
```

`cfchat-db` is the retained legacy D1 database name. Keep using it unless you are doing a planned data migration.

### 3. 創建管理員賬戶

```bash
docker compose exec \
  -e EDGECHAT_ADMIN_USERNAME=admin \
  -e EDGECHAT_ADMIN_PASSWORD='請替換為強密碼' \
  -e EDGECHAT_ADMIN_DISPLAY_NAME=Administrator \
  edgechat node .github/scripts/generate-admin-bootstrap-sql.mjs
docker compose exec edgechat wrangler d1 execute cfchat-db --local --file=.tmp/edgechat-admin-upsert.sql
```

## 📊 常用命令

```bash
# 查看容器狀態
docker compose ps

# 查看日誌
docker compose logs -f

# 重啟服務
docker compose restart

# 停止服務
docker compose down

# 完全清理（包括數據）
docker compose down -v
```

## 🔧 故障排查

### 問題：顯示"服務器開小差了"

**原因**：數據庫未初始化

**解決**：運行 `./docker-start.sh` 或手動執行步驟 2 和 3

### 問題：端口被佔用

**解決**：修改 `docker-compose.yml` 中的端口映射

```yaml
ports:
  - "8788:8787"  # 改為其他端口，如 "9000:8787"
```

### 問題：容器一直重啟

**解決**：查看日誌找出原因

```bash
docker compose logs --tail=50
```

## 🌐 生產部署

Docker 僅用於本地開發和測試。

生產環境請部署到 Cloudflare Workers：

```bash
# 配置 wrangler.toml
# 然後部署
npm run deploy
```

## 📝 注意事項

- 本地開發使用 SQLite（D1 本地模式）
- 數據存儲在 `.wrangler/state/` 目錄
- 停止容器不會丟失數據
- 使用 `docker compose down -v` 會清除所有數據
