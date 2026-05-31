@echo off
chcp 65001 >nul
echo ========================================
echo  矿山巷道通风管网3D交互系统 - 一键启动
echo ========================================
echo.

echo 正在启动后端服务...
start "后端服务" cmd /k "%~dp0start-backend.bat"

echo 等待后端启动...
timeout /t 15 /nobreak >nul

echo.
echo 正在启动前端服务...
start "前端服务" cmd /k "%~dp0start-frontend.bat"

echo.
echo ========================================
echo  启动完成！
echo  前端地址: http://localhost:5173
echo  后端地址: http://localhost:8081
echo ========================================
echo.
pause
