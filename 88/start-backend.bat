@echo off
echo ========================================
echo  铭牌OCR识别系统 - 后端服务启动
echo ========================================
echo.

cd /d "%~dp0backend"

if not exist ".venv" (
    echo [INFO] 正在创建Python虚拟环境...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] 虚拟环境创建失败，请确保Python已安装
        pause
        exit /b 1
    )
    echo [INFO] 虚拟环境创建成功
)

echo [INFO] 激活虚拟环境...
call .venv\Scripts\activate

echo [INFO] 安装依赖包...
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] 依赖安装失败
    pause
    exit /b 1
)

echo.
echo ========================================
echo  后端服务启动中...
echo  接口地址: http://localhost:8000
echo  API文档: http://localhost:8000/docs
echo ========================================
echo.

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

pause
