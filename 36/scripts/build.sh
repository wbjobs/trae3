#!/bin/bash
# 通用编译脚本 - Linux/macOS
# 用法: ./build.sh [工程路径] [编译命令]

set -e

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

detect_project_type() {
    local dir="$1"
    
    if ls "$dir"/*.ioc 1> /dev/null 2>&1; then
        echo "stm32"
        return
    fi
    
    if grep -q "esp32\|ESP32" "$dir"/CMakeLists.txt 2>/dev/null || \
       ls "$dir"/*sdkconfig* 1> /dev/null 2>&1; then
        echo "esp32"
        return
    fi
    
    if ls "$dir"/*.uvprojx 1> /dev/null 2>&1; then
        echo "keil"
        return
    fi
    
    if ls "$dir"/*.ewp 1> /dev/null 2>&1; then
        echo "iar"
        return
    fi
    
    if [ -f "$dir/Makefile" ]; then
        echo "makefile"
        return
    fi
    
    echo "generic"
}

PROJECT_TYPE=$(detect_project_type "$PROJECT_PATH")
echo "[信息] 检测到工程类型: $PROJECT_TYPE"

case "$PROJECT_TYPE" in
    stm32)
        exec "$SCRIPT_DIR/build_stm32.sh" "$PROJECT_PATH" "$BUILD_COMMAND"
        ;;
    esp32)
        exec "$SCRIPT_DIR/build_esp32.sh" "$PROJECT_PATH" "$BUILD_COMMAND"
        ;;
    keil|iar|makefile|generic)
        if [ -z "$BUILD_COMMAND" ]; then
            if [ -f "$PROJECT_PATH/Makefile" ]; then
                BUILD_COMMAND="make -j$(nproc)"
            elif ls "$PROJECT_PATH"/*.uvprojx 1> /dev/null 2>&1; then
                for f in "$PROJECT_PATH"/*.uvprojx; do
                    BUILD_COMMAND="/opt/Keil_v5/UV4/UV4 -b \"$f\""
                done
            else
                echo "[错误] 无法自动确定编译命令，请手动指定"
                exit 1
            fi
        fi
        
        echo "[信息] 执行编译命令: $BUILD_COMMAND"
        cd "$PROJECT_PATH"
        eval "$BUILD_COMMAND"
        ;;
    *)
        echo "[错误] 不支持的工程类型: $PROJECT_TYPE"
        exit 1
        ;;
esac
