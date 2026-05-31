@echo off
echo ========================================
echo 工业设备振动数据分析系统 - 前端启动
echo ========================================

cd frontend

if not exist node_modules (
    echo 安装依赖...
    npm install
)

echo 启动开发服务...
npm run dev

pause
