@echo off
title VisitaDoctores - Sincronizador Local
set NODEPATH=C:\Program Files\nodejs
set PATH=%NODEPATH%;%PATH%

echo ============================================
echo   VisitaDoctores - Agente de Sincronizacion
echo ============================================
echo.

cd /d "%~dp0"

if not exist node_modules (
    echo [1/2] Instalando dependencias necesarias...
    npm install mysql2
)

echo [2/2] Iniciando sincronizador...
echo.
node local_sync_agent.js

pause
