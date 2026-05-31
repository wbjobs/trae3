@echo off
REM 通用编译脚本 - Windows
REM 用法: build.bat [工程路径] [编译命令]

setlocal enabledelayedexpansion

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

set "SCRIPT_DIR=%~dp0"

cd /d "%PROJECT_PATH%"

set "PROJECT_TYPE=generic"

if exist *.ioc (
    set "PROJECT_TYPE=stm32"
) else (
    findstr /m "esp32 ESP32" CMakeLists.txt >nul 2>&1
    if !errorlevel! equ 0 (
        set "PROJECT_TYPE=esp32"
    ) else if exist sdkconfig (
        set "PROJECT_TYPE=esp32"
    ) else if exist *.uvprojx (
        set "PROJECT_TYPE=keil"
    ) else if exist *.ewp (
        set "PROJECT_TYPE=iar"
    ) else if exist Makefile (
        set "PROJECT_TYPE=makefile"
    )
)

echo [信息] 检测到工程类型: %PROJECT_TYPE%

if "%PROJECT_TYPE%"=="stm32" (
    call "%SCRIPT_DIR%build_stm32.bat" "%PROJECT_PATH%" "%BUILD_COMMAND%"
    exit /b %ERRORLEVEL%
)

if "%PROJECT_TYPE%"=="esp32" (
    call "%SCRIPT_DIR%build_esp32.bat" "%PROJECT_PATH%" "%BUILD_COMMAND%"
    exit /b %ERRORLEVEL%
)

if "%BUILD_COMMAND%"=="" (
    if exist Makefile (
        set "BUILD_COMMAND=make -j4"
    ) else if exist *.uvprojx (
        for %%f in (*.uvprojx) do (
            set "BUILD_COMMAND=C:\Keil_v5\UV4\UV4.exe -b "%%f""
        )
    ) else (
        echo [错误] 无法自动确定编译命令，请手动指定
        exit /b 1
    )
)

echo [信息] 执行编译命令: %BUILD_COMMAND%
call %BUILD_COMMAND%

set "BUILD_EXIT_CODE=%ERRORLEVEL%"

if "%BUILD_EXIT_CODE%"=="0" (
    echo [成功] 编译完成！
) else (
    echo [错误] 编译失败，退出码: %BUILD_EXIT_CODE%
)

exit /b %BUILD_EXIT_CODE%
