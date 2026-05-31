@echo off
echo ========================================
echo 科研样本元数据管理平台 - 快速启动脚本
echo ========================================
echo.
echo 请选择启动选项:
echo [1] 仅启动后端 (SpringBoot)
echo [2] 仅启动前端 (React)
echo [3] 启动前后端联调
echo [4] 安装依赖
echo [5] 退出
echo.

set /p choice=请输入选项 [1-5]: 

if "%choice%"=="1" goto start_backend
if "%choice%"=="2" goto start_frontend
if "%choice%"=="3" goto start_both
if "%choice%"=="4" goto install_deps
if "%choice%"=="5" goto end

echo 无效选项！
pause
goto end

:start_backend
echo.
echo 正在启动后端服务...
cd backend
mvn spring-boot:run
goto end

:start_frontend
echo.
echo 正在启动前端服务...
cd frontend
npm run dev
goto end

:start_both
echo.
echo 正在启动前后端服务...
echo 后端将在新窗口启动...

cd backend
start "后端服务" cmd /k "mvn spring-boot:run"

echo 等待后端启动...
timeout /t 10 /nobreak

echo 正在启动前端...
cd ..\frontend
start "前端服务" cmd /k "npm run dev"

echo.
echo ========================================
echo 后端服务: http://localhost:8080
echo 前端服务: http://localhost:5173
echo ========================================
echo.
goto end

:install_deps
echo.
echo 正在安装后端依赖...
cd backend
call mvn clean install -DskipTests

echo.
echo 正在安装前端依赖...
cd ..\frontend
call npm install

echo.
echo 依赖安装完成！
pause
goto end

:end
