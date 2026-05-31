@echo off
echo ========================================
echo  Starting Frontend Dev Server
echo ========================================
echo.

cd /d "%~dp0"

echo [1/2] Checking npm dependencies...
npm install

echo.
echo [2/2] Starting Vite dev server on http://localhost:5173
echo.
npm run dev

pause
