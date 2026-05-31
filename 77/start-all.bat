@echo off
echo ========================================
echo  Monitoring System - Full Stack
echo ========================================
echo.

echo Starting backend server in new window...
start "Backend Server" cmd /k "%~dp0start-backend.bat"

echo Waiting 5 seconds for backend to start...
timeout /t 5 /nobreak

echo.
echo Starting frontend dev server...
start "Frontend Server" cmd /k "%~dp0start-frontend.bat"

echo.
echo ========================================
echo  Services started:
echo  - Backend API:  http://localhost:8000
echo  - API Docs:     http://localhost:8000/docs
echo  - Frontend:     http://localhost:5173
echo ========================================
echo.
pause
