@echo off
setlocal enabledelayedexpansion
title VisitaDoctores - Sincronizador Local (Debug)

echo ============================================
echo   VisitaDoctores - Agente de Sincronizacion
echo ============================================
echo.

:: 1. Intentar detectar Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] No se pudo encontrar 'node' en el sistema.
    echo Asegurate de tener Node.js instalado y reinicia la computadora.
    pause
    exit /b
)

cd /d "%~dp0"

:: 2. Instalar mysql2 si no existe
if not exist node_modules (
    echo [1/2] Instalando dependencias...
    call npm install mysql2
    if !errorlevel! neq 0 (
        echo [ERROR] No se pudo instalar mysql2. Revisa tu conexion a internet.
        pause
        exit /b
    )
)

:: 3. Iniciar el agente
echo [2/2] Iniciando sincronizador...
echo.
node local_sync_agent.js

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] El sincronizador se detuvo inesperadamente.
)

pause
