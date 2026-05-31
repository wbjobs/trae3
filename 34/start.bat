@echo off
echo ========================================
echo CFD分布式计算调度系统 - Windows启动脚本
echo ========================================

echo.
echo [1/3] 检查Node.js环境...
node --version
if %errorlevel% neq 0 (
    echo 错误: 未找到Node.js，请先安装Node.js 18+
    pause
    exit /b 1
)

echo.
echo [2/3] 安装项目依赖...
if not exist "node_modules" (
    npm install
)

echo.
echo [3/3] 启动开发服务器...
echo 前端地址: http://localhost:5173
echo 后端API:  http://localhost:8080
echo.
echo 按 Ctrl+C 停止服务
echo.

npm run dev

pause
