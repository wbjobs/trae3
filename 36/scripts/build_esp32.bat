@echo off
REM ESP32 编译脚本 - Windows
REM 用法: build_esp32.bat [工程路径] [编译命令]

setlocal enabledelayedexpansion

echo ========================================
echo ESP32 固件编译脚本
echo ========================================
echo.

set "PROJECT_PATH=%~1"
set "BUILD_COMMAND=%~2"

if "%PROJECT_PATH%"=="" (
    echo [错误] 请指定工程路径
    echo 用法: %~nx0 [工程路径] [编译命令]
    exit /b 1
)

if not exist "%PROJECT_PATH%" (
    echo [错误] 工程路径不存在: %PROJECT_PATH%
    exit /b 1
)

echo [信息] 工程路径: %PROJECT_PATH%
echo.
echo [信息] 开始编译...
echo.

cd /d "%PROJECT_PATH%"

if exist "CMakeLists.txt" (
    echo [信息] 检测到 CMakeLists.txt
    
    REM 检查是否在 ESP-IDF 环境中
    where idf.py >nul 2>&1
    if !errorlevel! equ 0 (
        echo [信息] 检测到 ESP-IDF，使用 idf.py 构建
        if "%BUILD_COMMAND%"=="" (
            idf.py build
        ) else (
            %BUILD_COMMAND%
        )
    ) else (
        echo [警告] 未检测到 ESP-IDF，尝试使用 cmake
        if not exist "build" mkdir build
        cd build
        cmake ..
        if !errorlevel! equ 0 (
            cmake --build . -j4
        ) else (
            echo [错误] CMake 配置失败
            exit /b 1
        )
    )
) else if exist "Makefile" (
    echo [信息] 检测到 Makefile，执行 make
    if "%BUILD_COMMAND%"=="" (
        make -j4
    ) else (
        %BUILD_COMMAND%
    )
) else (
    echo [错误] 未找到支持的构建文件
    exit /b 1
)

set "BUILD_EXIT_CODE=%ERRORLEVEL%"

echo.
if "%BUILD_EXIT_CODE%"=="0" (
    echo [成功] 编译完成！
    echo [信息] 查找输出文件...
    for /r %%f in (*.elf *.bin *.hex) do (
        echo     找到: %%~nxf (%%~zf bytes)
    )
) else (
    echo [错误] 编译失败，退出码: %BUILD_EXIT_CODE%
)

echo.
echo ========================================
echo 编译结束
echo ========================================

exit /b %BUILD_EXIT_CODE%
