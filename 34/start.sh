#!/bin/bash

echo "========================================"
echo "CFD分布式计算调度系统 - Linux/Mac启动脚本"
echo "========================================"

echo ""
echo "[1/3] 检查Node.js环境..."
if ! command -v node &> /dev/null; then
    echo "错误: 未找到Node.js，请先安装Node.js 18+"
    exit 1
fi
node --version

echo ""
echo "[2/3] 安装项目依赖..."
if [ ! -d "node_modules" ]; then
    npm install
fi

echo ""
echo "[3/3] 启动开发服务器..."
echo "前端地址: http://localhost:5173"
echo "后端API:  http://localhost:8080"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

npm run dev
