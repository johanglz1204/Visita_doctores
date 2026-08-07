@echo off
echo ===================================================
echo   CREANDO PAQUETE DE ACTUALIZACION SICOIN
echo ===================================================
echo.

:: Colocarse en la carpeta del proyecto (soporta rutas con espacios, p.ej. "Visita _Doctores")
cd /d "%~dp0"

:: Crear carpeta temporal para el paquete
set PKG_DIR=%~dp0paquete_actualizacion
if exist "%PKG_DIR%" rmdir /s /q "%PKG_DIR%"
mkdir "%PKG_DIR%"

echo Copiando archivos del servidor...
:: /exclude no soporta rutas con espacios ni comillas correctamente,
:: por eso usamos una ruta relativa (ya estamos parados en la carpeta del proyecto).
xcopy /s /e /y "%~dp0server" "%PKG_DIR%\server\" /exclude:excluir_paquete.txt
echo.

echo Copiando archivos de configuracion...
if exist "%~dp0.env" copy /y "%~dp0.env" "%PKG_DIR%\"
if exist "%~dp0package.json" copy /y "%~dp0package.json" "%PKG_DIR%\"
if exist "%~dp0Actualizar_SICOIN.bat" copy /y "%~dp0Actualizar_SICOIN.bat" "%PKG_DIR%\"
if exist "%~dp0Iniciar_Servidor.bat" copy /y "%~dp0Iniciar_Servidor.bat" "%PKG_DIR%\"
if exist "%~dp0Servidor_Invisible.vbs" copy /y "%~dp0Servidor_Invisible.vbs" "%PKG_DIR%\"
echo.

echo ===================================================
echo   PAQUETE CREADO EN:
echo   %PKG_DIR%
echo.
echo   Sube SOLO esta carpeta a Drive.
echo   Peso aproximado: 5-15 MB (en vez de 1 GB)
echo ===================================================
echo.
pause
