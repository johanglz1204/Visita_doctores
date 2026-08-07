@echo off
setlocal

echo ===================================================
echo   DESPLEGANDO SICOIN AL SERVIDOR (via red)
echo ===================================================
echo.

cd /d "%~dp0"

:: ============================================================
:: CONFIGURA AQUI LA RUTA DE RED AL SERVIDOR
:: - Si estas en la oficina (misma red que 192.168.1.199), deja esta.
:: - Si te conectas de fuera via Hamachi, cambia la IP por la que
::   Hamachi le asigna a esa PC (la ves en el panel de Hamachi).
:: ============================================================
set SERVER_SHARE=\\192.168.1.199\SICOIN

echo Verificando acceso a %SERVER_SHARE% ...
if not exist "%SERVER_SHARE%\" (
    echo.
    echo [ERROR] No se pudo alcanzar %SERVER_SHARE%
    echo Verifica que:
    echo   - Estes conectado a la red de Hamachi
    echo   - La carpeta ya este compartida en el servidor ^(ver instrucciones^)
    echo   - La IP configurada en este script sea la correcta
    echo.
    pause
    exit /b 1
)
echo      Conexion OK.
echo.

echo [1/2] Reconstruyendo el cliente ^(React^)...
call npm run build
if errorlevel 1 (
    echo.
    echo [ERROR] Fallo el build del cliente. Se cancela el despliegue.
    echo         El servidor remoto NO fue modificado.
    pause
    exit /b 1
)
echo      Build OK.
echo.

echo [2/2] Copiando server/ al servidor remoto...
:: /E copia todas las subcarpetas (incluyendo vacias), pero NO borra en el
:: destino lo que no exista en el origen -- asi no se arriesga a borrar
:: archivos que el servidor genere en produccion (logs, uploads, etc).
:: /XD excluye node_modules y .git. /NFL /NDL /NP hacen el log mas limpio.
robocopy "%~dp0server" "%SERVER_SHARE%\server" /E /XD node_modules .git /NFL /NDL /NP
set RC=%ERRORLEVEL%
if %RC% GEQ 8 (
    echo.
    echo [ERROR] robocopy fallo con codigo %RC%
    pause
    exit /b 1
)
echo      Archivos copiados correctamente.
echo.

echo ===================================================
echo   DESPLIEGUE ENVIADO CORRECTAMENTE
echo.
echo   Siguiente paso:
echo   1. Conectate por VNC al servidor.
echo   2. Corre Actualizar_SICOIN.bat alla
echo      ^(reinicia el servicio con los archivos nuevos^).
echo ===================================================
pause
