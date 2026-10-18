#!/bin/bash

set -euo pipefail

ADMIN_USERNAME="${EDGECHAT_ADMIN_USERNAME:-admin}"
ADMIN_DISPLAY_NAME="${EDGECHAT_ADMIN_DISPLAY_NAME:-Administrator}"
ADMIN_PASSWORD="${EDGECHAT_ADMIN_PASSWORD:-}"

if [ -z "$ADMIN_PASSWORD" ]; then
    echo "请先设置 EDGECHAT_ADMIN_PASSWORD，再运行 ./docker-start.sh"
    exit 1
fi

echo "启动 Edgechat Docker 容器..."
docker compose up -d --build

echo "等待 Worker 健康检查..."
READY=false
for _attempt in $(seq 1 30); do
    if curl -fsS http://localhost:8788/api/health > /dev/null; then
        READY=true
        break
    fi
    sleep 2
done

if [ "$READY" != "true" ]; then
    echo "容器未能在 60 秒内通过健康检查"
    docker compose logs --tail=50
    exit 1
fi

echo "初始化本地 D1 数据库..."
# 本地继续复用历史 D1 名称，避免 Wrangler 创建第二套开发状态。
docker compose exec -T edgechat \
    wrangler d1 execute cfchat-db --local --file=./worker/schema.sql

echo "初始化管理员账户..."
# 复用生产 Actions 的密码生成器，保证 Docker 与 Worker 使用同一 PBKDF2 格式。
docker compose exec -T \
    -e EDGECHAT_ADMIN_USERNAME="$ADMIN_USERNAME" \
    -e EDGECHAT_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    -e EDGECHAT_ADMIN_DISPLAY_NAME="$ADMIN_DISPLAY_NAME" \
    edgechat node .github/scripts/generate-admin-bootstrap-sql.mjs
docker compose exec -T edgechat \
    wrangler d1 execute cfchat-db --local --file=.tmp/edgechat-admin-upsert.sql

echo "管理员账户已就绪：$ADMIN_USERNAME"

echo ""
echo "Edgechat 启动完成！"
echo ""
echo "📱 访问地址："
echo "   http://localhost:8788"
echo ""
echo "✨ 特性："
echo "   🎨 Liquid Glass 毛玻璃效果"
echo "   📱 移动端完美适配"
echo "   🚀 现代化 UI 设计"
echo ""
echo "📝 常用命令："
echo "   查看日志: docker compose logs -f"
echo "   停止服务: docker compose down"
echo "   重启服务: docker compose restart"
echo ""
