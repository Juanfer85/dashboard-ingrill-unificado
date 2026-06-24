@echo off
TITLE Dashboard Unificado Ingrill - Lanzador
echo ===================================================
echo   PROYECTO: DASHBOARD UNIFICADO INGRILL
echo   UBICACION: %~dp0
echo ===================================================
echo.
echo Entrando al directorio del backend...
cd /d "%~dp0"
echo.
echo Iniciando Backend en Puerto 4001...
start "Unified Backend" cmd /c "node server/index.js"
echo.
echo Iniciando Frontend en Puerto 4003...
start "Unified Frontend" cmd /c "node client/server.js"
echo.
echo ===================================================
echo Dashboard abierto en: http://localhost:4003
echo Backend corriendo en: http://localhost:4001
echo ===================================================
pause
