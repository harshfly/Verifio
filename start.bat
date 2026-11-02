@echo off
title Verifio — Authenticity Platform
chcp 65001 >nul
cls

echo ========================================================
echo          VERIFIO — AUTHENTICITY & INTEGRITY PLATFORM
echo ========================================================
echo.
echo [1/3] Clearing stale processes on ports 8000 and 3000...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000,3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo [2/3] Starting Backend API (FastAPI) on http://localhost:8000...
start "Verifio Backend" /min cmd /c "cd /d "%~dp0backend" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [3/3] Starting Frontend Server on http://localhost:3000...
start "Verifio Frontend" /min cmd /c "cd /d "%~dp0" && npx --yes serve -l 3000 ."

echo.
echo Waiting for servers to initialize...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo ========================================================
echo  STATUS: All systems running!
echo  - Frontend App:      http://localhost:3000
echo  - Backend API:       http://localhost:8000
echo  - Swagger API Docs:  http://localhost:8000/docs
echo ========================================================
echo.
echo Keep this window open while using Verifio.
echo Press ANY KEY to stop all servers and exit.
echo ========================================================
pause >nul

echo.
echo Stopping all Verifio servers...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000,3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
echo Done. All servers stopped.
timeout /t 2 >nul
