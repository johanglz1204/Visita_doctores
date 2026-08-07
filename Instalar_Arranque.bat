@echo off
echo ===================================================
echo INSTALANDO SICOIN EN EL ARRANQUE DEL SERVIDOR
echo ===================================================
echo.
echo Esto configurara la aplicacion para que arranque sola
echo en segundo plano cada vez que el servidor se reinicie.
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SOURCE_VBS=%~dp0Servidor_Invisible.vbs"
set "DEST_VBS=%STARTUP_FOLDER%\SICOIN_Server.vbs"

echo Copiando script a la carpeta de inicio...
copy /Y "%SOURCE_VBS%" "%DEST_VBS%" >nul

if %errorlevel% equ 0 (
    echo [EXITO] SICOIN se iniciara automaticamente con Windows.
    echo.
    echo Para probarlo ahora mismo sin reiniciar, presiona cualquier tecla...
    pause >nul
    cscript //nologo "%DEST_VBS%"
    echo Servidor iniciado en segundo plano.
) else (
    echo [ERROR] Hubo un problema al copiar el archivo.
)
echo.
pause
