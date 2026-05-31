@echo off
echo ========================================
echo  文书手写字迹识别系统 - 一键启动
echo ========================================
echo.

echo 正在启动 MongoDB (如果已安装 Docker)...
docker-compose up -d mongodb 2>nul
echo.

echo 正在启动后端服务...
start "后端服务" cmd /k "cd /d %~dp0backend && run.bat"

echo 等待后端服务启动...
timeout /t 5 /nobreak >nul

echo.
echo 正在启动前端服务...
start "前端服务" cmd /k "cd /d %~dp0frontend && run.bat"

echo.
echo ========================================
echo  启动完成！
echo.
echo  前端地址: http://localhost:5173
echo  后端地址: http://localhost:8000
echo  API 文档: http://localhost:8000/docs
echo ========================================
echo.
pause
