@echo off
chcp 65001 >nul
echo ========================================
echo    工业数据监控平台 - 启动脚本
echo ========================================
echo.

echo [1/4] 安装后端依赖...
cd /d "%~dp0backend"
pip install -r requirements.txt -q
if %errorlevel% neq 0 (
    echo 后端依赖安装失败！
    pause
    exit /b 1
)

echo [2/4] 安装前端依赖...
cd /d "%~dp0frontend"
call npm install
if %errorlevel% neq 0 (
    echo 前端依赖安装失败！
    pause
    exit /b 1
)

echo [3/4] 创建数据目录...
if not exist "%~dp0backend\data" mkdir "%~dp0backend\data"

echo [4/4] 启动服务...
echo.
echo 后端服务: http://localhost:8001
echo 前端界面: http://localhost:5173
echo API文档:  http://localhost:8001/docs
echo.

start "后端服务" cmd /k "cd /d %~dp0 && python -m uvicorn backend.main:app --host 0.0.0.0 --port 8001 --reload"
timeout /t 3 /nobreak >nul
start "前端服务" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo 服务已启动，请等待几秒后访问 http://localhost:5173
pause
