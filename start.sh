#!/bin/bash

echo "🚀 啟動 Edgechat..."
echo ""

# 檢查依賴
if [ ! -d "node_modules" ]; then
    echo "📦 安裝依賴..."
    npm install
fi

# 啟動前端開發服務器
echo "🎨 啟動前端服務器..."
npm run dev:frontend &
FRONTEND_PID=$!

# 等待服務器啟動
sleep 5

echo ""
echo "✅ Edgechat 已啟動！"
echo ""
echo "📱 訪問地址："
echo "   本地: http://localhost:5173"
echo "   網絡: http://$(hostname -I | awk '{print $1}'):5173"
echo ""
echo "💡 特性："
echo "   ✨ Liquid Glass 毛玻璃效果"
echo "   📱 移動端適配"
echo "   🎯 現代化 UI 設計"
echo ""
echo "按 Ctrl+C 停止服務器"
echo ""

# 等待進程
wait $FRONTEND_PID
