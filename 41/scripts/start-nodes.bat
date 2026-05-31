@echo off
chcp 65001 >nul
title 边缘节点启动器

cd /d "%~dp0..\edge-node"

echo 选择启动模式:
echo [1] 启动全部5个节点
echo [2] 启动单个节点（手动输入参数）
echo.
set /p choice="请输入选项 [1-2]: "

if "%choice%"=="1" (
    echo 启动全部节点...
    start "节点1-北京" cmd /k "python client.py node-001 北京机房-节点1 北京机房-A区"
    start "节点2-北京" cmd /k "python client.py node-002 北京机房-节点2 北京机房-A区"
    start "节点3-上海" cmd /k "python client.py node-003 上海机房-节点1 上海机房-B区"
    start "节点4-上海" cmd /k "python client.py node-004 上海机房-节点2 上海机房-B区"
    start "节点5-深圳" cmd /k "python client.py node-005 深圳机房-节点1 深圳机房-C区"
    echo 已启动5个节点窗口
) else if "%choice%"=="2" (
    set /p node_id="节点ID (如 node-006): "
    set /p node_name="节点名称: "
    set /p location="节点位置: "
    echo 启动节点 %node_id%...
    python client.py %node_id% "%node_name%" "%location%"
) else (
    echo 无效选项
    pause
    exit /b 1
)
