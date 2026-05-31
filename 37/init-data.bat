@echo off
echo ========================================
echo 初始化演示数据
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

echo 初始化演示数据...
python init_demo_data.py

echo.
echo 初始化完成！
pause
