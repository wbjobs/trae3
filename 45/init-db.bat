@echo off
echo ========================================
echo  数据库初始化脚本
echo ========================================
echo.

echo [1/2] 检查依赖...
if not exist "node_modules" (
    echo 正在安装依赖...
    call npm install
)

echo.
echo [2/2] 初始化数据库...
call npx ts-node scripts/initDb.ts

echo.
echo 数据库初始化完成！
pause
