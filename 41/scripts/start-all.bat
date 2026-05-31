@echo off
chcp 65001 >nul
title 边缘节点监控系统 - 一键启动

echo ========================================
echo    边缘节点监控系统
echo ========================================
echo.

cd /d "%~dp0.."

echo [1/4] 安装Python服务端依赖...
pip install -q fastapi uvicorn psutil
if %errorlevel% neq 0 (
    echo 安装Python依赖失败
    pause
    exit /b 1
)

echo [2/4] 启动服务端 (TCP:8888, HTTP:8000)...
start "服务端" cmd /k "cd /d %~dp0..\server && python api_server.py"

timeout /t 3 /nobreak >nul

echo [3/4] 启动模拟边缘节点...
start "节点1-北京" cmd /k "cd /d %~dp0..\edge-node && python client.py node-001 北京机房-节点1 北京机房-A区"
start "节点2-北京" cmd /k "cd /d %~dp0..\edge-node && python client.py node-002 北京机房-节点2 北京机房-A区"
start "节点3-上海" cmd /k "cd /d %~dp0..\edge-node && python client.py node-003 上海机房-节点1 上海机房-B区"
start "节点4-上海" cmd /k "cd /d %~dp0..\edge-node && python client.py node-004 上海机房-节点2 上海机房-B区"
start "节点5-深圳" cmd /k "cd /d %~dp0..\edge-node && python client.py node-005 深圳机房-节点1 深圳机房-C区"

timeout /t 2 /nobreak >nul

echo [4/4] 启动前端开发服务器...
start "前端" cmd /k "cd /d %~dp0..\frontend && npm run dev"

echo.
echo ========================================
echo    系统启动完成！
echo ========================================
echo.
echo 服务地址:
echo   - TCP服务: 127.0.0.1:8888
echo   - HTTP API: http://127.0.0.1:8000
echo   - API文档: http://127.0.0.1:8000/docs
echo   - 前端面板: http://127.0.0.1:5173
echo.
echo 按任意键关闭此窗口（其他窗口继续运行）...
pause >nul
