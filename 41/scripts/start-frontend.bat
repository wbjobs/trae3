@echo off
chcp 65001 >nul
title 前端开发服务器

cd /d "%~dp0..\frontend"

echo 正在启动前端开发服务器...
echo 访问地址: http://127.0.0.1:5173
echo.

npm run dev
