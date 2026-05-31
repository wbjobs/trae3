@echo off
echo ========================================
echo  铭牌OCR识别系统 - 前端服务启动
echo ========================================
echo.

cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo [INFO] 正在安装前端依赖...
    call npm install
    if errorlevel 1 (
        echo [ERROR] 依赖安装失败，请确保Node.js已安装
        pause
        exit /b 1
    )
    echo [INFO] 依赖安装成功
)

echo.
echo ========================================
echo  前端服务启动中...
echo  访问地址: http://localhost:3000
echo ========================================
echo.

call npm run dev

pause
