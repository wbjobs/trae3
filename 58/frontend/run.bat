@echo off
echo ========================================
echo  文书手写字迹识别系统 - 前端服务启动
echo ========================================
echo.

echo [1/3] 检查 Node.js 环境...
node --version
if errorlevel 1 (
    echo 错误: 未找到 Node.js，请先安装 Node.js 16+
    pause
    exit /b 1
)

echo.
echo [2/3] 检查依赖...
if not exist "node_modules" (
    echo 正在安装依赖...
    npm install
)

echo.
echo [3/3] 启动开发服务器...
echo.
echo 服务地址: http://localhost:5173
echo.
echo 按 Ctrl+C 停止服务
echo ========================================
echo.

npm run dev

pause
