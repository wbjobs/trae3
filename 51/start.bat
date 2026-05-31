@echo off
echo ========================================
echo  日志审计系统 - 启动脚本
echo ========================================
echo.

echo [1/3] 检查后端依赖...
if not exist "backend\node_modules" (
    echo 正在安装后端依赖...
    cd backend
    npm install
    cd ..
)

echo [2/3] 检查前端依赖...
if not exist "frontend\node_modules" (
    echo 正在安装前端依赖...
    cd frontend
    npm install
    cd ..
)

echo [3/3] 启动服务...
echo.
echo 后端服务端口: 3001
echo 前端服务端口: 3000
echo.
echo 请在新的终端窗口中分别执行:
echo   cd backend ^&^& npm start
echo   cd frontend ^&^& npm run dev
echo.
echo 或者使用以下命令启动模拟终端:
echo   cd backend
echo   node scripts/mock-terminal.js CAR-001
echo.
pause