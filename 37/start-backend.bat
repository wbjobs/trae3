@echo off
echo ========================================
echo 工业设备振动数据分析系统 - 后端启动
echo ========================================

cd backend

if not exist venv (
    echo 创建虚拟环境...
    python -m venv venv
)

echo 激活虚拟环境...
call venv\Scripts\activate

echo 安装依赖...
pip install -r requirements.txt

echo 启动服务...
python main.py

pause
