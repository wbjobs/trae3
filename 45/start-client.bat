@echo off
echo ========================================
echo  战术对局客户端启动脚本
echo ========================================
echo.

echo [1/3] 检查 Node.js 环境...
node --version
if %errorlevel% neq 0 (
    echo 错误: 未检测到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

echo.
echo [2/3] 编译客户端代码...
call npx tsc -p client/tsconfig.json

echo.
echo [3/3] 启动客户端（请在浏览器中访问 http://localhost:3000）...
echo.
echo 提示：请确保服务端已启动
echo.
pause
start http://localhost:3000
