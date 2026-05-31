#!/bin/bash
# STM32 编译脚本 - Linux/macOS
# 用法: ./build_stm32.sh [工程路径] [编译命令]

set -e

echo "========================================"
echo "STM32 固件编译脚本"
echo "========================================"
echo ""

PROJECT_PATH="$1"
BUILD_COMMAND="$2"

if [ -z "$PROJECT_PATH" ]; then
    echo "[错误] 请指定工程路径"
    echo "用法: $0 [工程路径] [编译命令]"
    exit 1
fi

if [ ! -d "$PROJECT_PATH" ]; then
    echo "[错误] 工程路径不存在: $PROJECT_PATH"
    exit 1
fi

if [ -z "$BUILD_COMMAND" ]; then
    BUILD_COMMAND="make -j$(nproc)"
fi

echo "[信息] 工程路径: $PROJECT_PATH"
echo "[信息] 编译命令: $BUILD_COMMAND"
echo ""
echo "[信息] 开始编译..."
echo ""

cd "$PROJECT_PATH"

if [ ! -f "Makefile" ]; then
    echo "[警告] 未找到 Makefile，尝试查找其他构建文件..."
    
    if [ -f "CMakeLists.txt" ]; then
        echo "[信息] 检测到 CMakeLists.txt，执行 CMake 构建"
        mkdir -p build
        cd build
        cmake ..
        if [ $? -ne 0 ]; then
            echo "[错误] CMake 配置失败"
            exit 1
        fi
        make -j$(nproc)
    elif ls *.uvprojx 1> /dev/null 2>&1; then
        echo "[信息] 检测到 Keil 工程文件"
        for f in *.uvprojx; do
            echo "[信息] 使用 Keil 编译: ${f%.*}"
            /opt/Keil_v5/UV4/UV4 -b "$f" -o "build.log" 2>&1 || true
        done
    else
        echo "[错误] 未找到支持的构建文件"
        exit 1
    fi
else
    echo "[信息] 检测到 Makefile，执行 make"
    $BUILD_COMMAND
fi

BUILD_EXIT_CODE=$?

echo ""
if [ $BUILD_EXIT_CODE -eq 0 ]; then
    echo "[成功] 编译完成！"
    echo "[信息] 查找输出文件..."
    find . -type f \( -name "*.elf" -o -name "*.bin" -o -name "*.hex" -o -name "*.axf" \) -exec echo "    找到: {} ({} bytes)" \;
else
    echo "[错误] 编译失败，退出码: $BUILD_EXIT_CODE"
fi

echo ""
echo "========================================"
echo "编译结束"
echo "========================================"

exit $BUILD_EXIT_CODE
