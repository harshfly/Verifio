@echo off
title Stop Verifio
chcp 65001 >nul
cls
echo ========================================================
echo          STOPPING VERIFIO SERVERS
echo ========================================================
echo.
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000,3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
echo [OK] Both Backend (8000) and Frontend (3000) stopped.
echo.
timeout /t 2 >nul
