@echo off
chcp 65001 >nul
echo ========================================
echo  矿山巷道通风管网3D交互系统 - 前端启动
echo ========================================
echo.

cd /d "%~dp0frontend"

echo [1/3] 检查 Node.js 环境...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js 16+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js 环境正常

echo.
echo [2/3] 检查依赖...
if not exist "node_modules" (
    echo 正在安装依赖...
    npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)
echo [OK] 依赖已安装

echo.
echo [3/3] 启动开发服务器...
echo 前端服务将运行在: http://localhost:5173
echo 请确保后端服务已启动在: http://localhost:8081
echo.

npm run dev

if %errorlevel% neq 0 (
    echo.
    echo [错误] 启动失败，请检查错误信息
    pause
)
