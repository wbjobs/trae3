@echo off
echo ========================================
echo  文书手写字迹识别系统 - 后端服务启动
echo ========================================
echo.

echo [1/3] 检查 Python 环境...
python --version
if errorlevel 1 (
    echo 错误: 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)

echo.
echo [2/3] 检查并创建上传目录...
if not exist "uploads" mkdir uploads

echo.
echo [3/3] 启动 FastAPI 服务...
echo.
echo 服务地址: http://localhost:8000
echo API 文档: http://localhost:8000/docs
echo.
echo 按 Ctrl+C 停止服务
echo ========================================
echo.

python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

pause
