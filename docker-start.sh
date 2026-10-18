#!/bin/bash

set -euo pipefail

ADMIN_USERNAME="${EDGECHAT_ADMIN_USERNAME:-admin}"
ADMIN_DISPLAY_NAME="${EDGECHAT_ADMIN_DISPLAY_NAME:-Administrator}"
ADMIN_PASSWORD="${EDGECHAT_ADMIN_PASSWORD:-}"

if [ -z "$ADMIN_PASSWORD" ]; then
    echo "請先設置 EDGECHAT_ADMIN_PASSWORD，再運行 ./docker-start.sh"
    exit 1
fi

echo "啟動 Edgechat Docker 容器..."
docker compose up -d --build

echo "等待 Worker 健康檢查..."
READY=false
for _attempt in $(seq 1 30); do
    if curl -fsS http://localhost:8788/api/health > /dev/null; then
        READY=true
        break
    fi
    sleep 2
done

if [ "$READY" != "true" ]; then
    echo "容器未能在 60 秒內通過健康檢查"
    docker compose logs --tail=50
    exit 1
fi

echo "初始化本地 D1 數據庫..."
# 本地繼續複用歷史 D1 名稱，避免 Wrangler 創建第二套開發狀態。
docker compose exec -T edgechat \
    wrangler d1 execute cfchat-db --local --file=./worker/schema.sql

echo "初始化管理員賬戶..."
# 複用生產 Actions 的密碼生成器，保證 Docker 與 Worker 使用同一 PBKDF2 格式。
docker compose exec -T \
    -e EDGECHAT_ADMIN_USERNAME="$ADMIN_USERNAME" \
    -e EDGECHAT_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    -e EDGECHAT_ADMIN_DISPLAY_NAME="$ADMIN_DISPLAY_NAME" \
    edgechat node .github/scripts/generate-admin-bootstrap-sql.mjs
docker compose exec -T edgechat \
    wrangler d1 execute cfchat-db --local --file=.tmp/edgechat-admin-upsert.sql

echo "管理員賬戶已就緒：$ADMIN_USERNAME"

echo ""
echo "Edgechat 啟動完成！"
echo ""
echo "📱 訪問地址："
echo "   http://localhost:8788"
echo ""
echo "✨ 特性："
echo "   🎨 Liquid Glass 毛玻璃效果"
echo "   📱 移動端完美適配"
echo "   🚀 現代化 UI 設計"
echo ""
echo "📝 常用命令："
echo "   查看日誌: docker compose logs -f"
echo "   停止服務: docker compose down"
echo "   重啟服務: docker compose restart"
echo ""
