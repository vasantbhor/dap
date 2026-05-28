@echo off
title DepositPro Launcher
echo Starting DepositPro Local Server...

:: Start a silent background HTTP server using npx
start /b cmd /c "npx http-server -p 8080 --silent"

:: Wait a brief moment for the server to start
timeout /t 2 /nobreak >nul

echo Launching DepositPro Application...
:: Open in Standalone App Mode pointing to localhost to resolve CORS and local file security blocks
start msedge --app="http://127.0.0.1:8080/index.html" --window-size=1280,800

exit
