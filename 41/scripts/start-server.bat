@echo off
chcp 65001 >nul
title 服务端

cd /d "%~dp0..\server"

echo 正在启动服务端...
echo TCP端口: 8888
echo HTTP端口: 8000
echo.

python api_server.py
