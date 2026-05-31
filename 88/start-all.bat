@echo off
echo ========================================
echo  铭牌OCR识别系统 - 一键启动
echo ========================================
echo.

cd /d "%~dp0"

echo [1/2] 启动后端服务...
start "后端服务" cmd /k call start-backend.bat

echo [2/2] 等待后端服务初始化...
timeout /t 5 /nobreak > nul

echo [2/2] 启动前端服务...
start "前端服务" cmd /k call start-frontend.bat

echo.
echo ========================================
echo  系统启动完成！
echo  前端地址: http://localhost:3000
echo  后端地址: http://localhost:8000
echo  API文档: http://localhost:8000/docs
echo ========================================
echo.
pause
