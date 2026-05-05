@echo off
echo ====================================
echo  SINCRONIZADOR VISITA DOCTORES
echo  Stock + Ventas → Firebase
echo ====================================
echo.

cd /d "%~dp0"
cd scripts

echo [1/2] Sincronizando inventario de sucursales...
call npm run sync-inventory
if %ERRORLEVEL% NEQ 0 (
    echo ERROR en sincronización de inventario
    pause
    exit /b 1
)

echo.
echo [2/2] Sincronizando ventas del día anterior...
call npm run sync-sales
if %ERRORLEVEL% NEQ 0 (
    echo ERROR en sincronización de ventas
    pause
    exit /b 1
)

echo.
echo ====================================
echo  ✅ SINCRONIZACIÓN COMPLETA
echo ====================================
echo.
timeout /t 5
