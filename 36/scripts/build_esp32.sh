#!/bin/bash
# ESP32 编译脚本 - Linux/macOS
# 用法: ./build_esp32.sh [工程路径] [编译命令]

set -e

echo "========================================"
echo "ESP32 固件编译脚本"
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

echo "[信息] 工程路径: $PROJECT_PATH"
echo ""
echo "[信息] 开始编译..."
echo ""

cd "$PROJECT_PATH"

if [ -f "CMakeLists.txt" ]; then
    echo "[信息] 检测到 CMakeLists.txt"
    
    if command -v idf.py &> /dev/null; then
        echo "[信息] 检测到 ESP-IDF，使用 idf.py 构建"
        if [ -z "$BUILD_COMMAND" ]; then
            idf.py build
        else
            $BUILD_COMMAND
        fi
    else
        echo "[警告] 未检测到 ESP-IDF，尝试使用 cmake"
        mkdir -p build
        cd build
        cmake ..
        if [ $? -eq 0 ]; then
            cmake --build . -j$(nproc)
        else
            echo "[错误] CMake 配置失败"
            exit 1
        fi
    fi
elif [ -f "Makefile" ]; then
    echo "[信息] 检测到 Makefile，执行 make"
    if [ -z "$BUILD_COMMAND" ]; then
        make -j$(nproc)
    else
        $BUILD_COMMAND
    fi
else
    echo "[错误] 未找到支持的构建文件"
    exit 1
fi

BUILD_EXIT_CODE=$?

echo ""
if [ $BUILD_EXIT_CODE -eq 0 ]; then
    echo "[成功] 编译完成！"
    echo "[信息] 查找输出文件..."
    find . -type f \( -name "*.elf" -o -name "*.bin" -o -name "*.hex" \) -exec echo "    找到: {} ({} bytes)" \;
else
    echo "[错误] 编译失败，退出码: $BUILD_EXIT_CODE"
fi

echo ""
echo "========================================"
echo "编译结束"
echo "========================================"

exit $BUILD_EXIT_CODE
