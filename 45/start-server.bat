@echo off
echo ========================================
echo  战术对局服务端启动脚本
echo ========================================
echo.

echo [1/3] 检查 Node.js 环境...
node --version
if %errorlevel% neq 0 (
    echo 错误: 未检测到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

echo.
echo [2/3] 检查依赖...
if not exist "node_modules" (
    echo 正在安装依赖...
    call npm install
)

echo.
echo [3/3] 启动服务端...
call npm run server

pause
