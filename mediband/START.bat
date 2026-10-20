@echo off
title MediBand - Starting Dev Server
color 0A
echo.
echo  ========================================
echo    MediBand - Starting Dev Server
echo  ========================================
echo.

REM Start Next.js dev server in a new window
echo  Starting MediBand on http://localhost:3000 ...
start "MediBand - Dev Server" cmd /k "cd /d %~dp0 && npm run dev"

REM Wait for server to boot
timeout /t 5 /nobreak > nul

REM Open browser
echo.
echo  Opening browser...
start http://localhost:3000

echo.
echo  ========================================
echo    MediBand is running!
echo    App    : http://localhost:3000
echo    Scan   : http://localhost:3000/scan
echo    Cabinet: http://localhost:3000/cabinet
echo.
echo    Close the terminal window to stop.
echo  ========================================
echo.
pause
