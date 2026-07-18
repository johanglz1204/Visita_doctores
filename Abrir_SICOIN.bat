@echo off
title SICOIN - Iniciando Sistema

echo ==================================================
echo      SICOIN - CONTROL DE INVENTARIOS
echo ==================================================
echo.
echo Iniciando entorno local. Por favor espera...

cd /d "%~dp0"

echo.
echo [OK] Todo listo. Abriendo la aplicacion de escritorio...
start "" "dist-exe\SICOIN-win32-x64\SICOIN.exe"

exit
