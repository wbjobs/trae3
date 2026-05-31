@echo off
REM STM32 编译脚本 - Windows
REM 用法: build_stm32.bat [工程路径] [编译命令]

setlocal enabledelayedexpansion

echo ========================================
echo STM32 固件编译脚本
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

if "%BUILD_COMMAND%"=="" set "BUILD_COMMAND=make -j4"

echo [信息] 工程路径: %PROJECT_PATH%
echo [信息] 编译命令: %BUILD_COMMAND%
echo.
echo [信息] 开始编译...
echo.

cd /d "%PROJECT_PATH%"

REM 检查是否有 Makefile
if not exist "Makefile" (
    echo [警告] 未找到 Makefile，尝试查找其他构建文件...
    
    if exist "CMakeLists.txt" (
        echo [信息] 检测到 CMakeLists.txt，执行 CMake 构建
        if not exist "build" mkdir build
        cd build
        cmake .. -G "MinGW Makefiles"
        if errorlevel 1 (
            echo [错误] CMake 配置失败
            exit /b 1
        )
        mingw32-make -j4
    ) else if exist "*.uvprojx" (
        echo [信息] 检测到 Keil 工程文件
        for %%f in (*.uvprojx) do (
            echo [信息] 使用 Keil 编译: %%~nf
            "C:\Keil_v5\UV4\UV4.exe" -b "%%f" -o "build.log"
        )
    ) else (
        echo [错误] 未找到支持的构建文件
        exit /b 1
    )
) else (
    echo [信息] 检测到 Makefile，执行 make
    %BUILD_COMMAND%
)

set "BUILD_EXIT_CODE=%ERRORLEVEL%"

echo.
if "%BUILD_EXIT_CODE%"=="0" (
    echo [成功] 编译完成！
    
    REM 查找输出文件
    echo [信息] 查找输出文件...
    for /r %%f in (*.elf *.bin *.hex *.axf) do (
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
