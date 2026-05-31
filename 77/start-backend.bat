@echo off
echo ========================================
echo  Starting Backend Server
echo ========================================
echo.

cd /d "%~dp0backend"

echo [1/2] Checking Python dependencies...
pip install -r requirements.txt

echo.
echo [2/2] Starting FastAPI server on http://localhost:8000
echo.
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

pause
