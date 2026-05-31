@echo off
chcp 65001 >nul
echo ========================================
echo  矿山巷道通风管网3D交互系统 - 后端启动
echo ========================================
echo.

cd /d "%~dp0backend"

echo [1/3] 检查 Maven 环境...
where mvn >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Maven，请先安装 Maven 并配置环境变量
    echo 下载地址: https://maven.apache.org/download.cgi
    pause
    exit /b 1
)
echo [OK] Maven 环境正常

echo.
echo [2/3] 检查 MongoDB 连接...
echo 请确保 MongoDB 已启动并运行在 localhost:27017
echo 如果 MongoDB 未启动，请先启动 MongoDB
pause

echo.
echo [3/3] 启动 Spring Boot 应用...
echo 后端服务将运行在: http://localhost:8081
echo.

mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Xmx512m -Xms256m"

if %errorlevel% neq 0 (
    echo.
    echo [错误] 启动失败，请检查错误信息
    pause
)
