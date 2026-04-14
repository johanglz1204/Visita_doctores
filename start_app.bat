@echo off
title VisitaDoctores
set NODEPATH=C:\Program Files\nodejs
set PATH=%NODEPATH%;%PATH%

echo VisitaDoctores - Iniciando...

if not exist "%NODEPATH%\node.exe" (
    echo ERROR: Node.js no encontrado.
    pause
    exit /b
)

echo OK Node.js listo.

docker ps >nul 2>&1
if not %errorlevel% == 0 (
    echo Iniciando Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo Esperando Docker, puede tomar hasta 90 segundos...
)

set TRIES=0
:CHECKDOCKER
docker ps >nul 2>&1
if %errorlevel% == 0 goto DOCKEROK
set /a TRIES+=1
if %TRIES% == 18 goto DOCKERFAIL
ping -n 6 127.0.0.1 >nul
goto CHECKDOCKER

:DOCKERFAIL
echo ERROR: Docker no respondio. Abrelo manualmente e intenta de nuevo.
pause
exit /b

:DOCKEROK
echo OK Docker listo.

echo Iniciando base de datos...
docker-compose -f "%~dp0docker-compose.db.yml" up -d
echo OK Base de datos lista.

echo Iniciando aplicacion...
echo Abre tu navegador en: http://localhost:5173
echo Presiona Ctrl+C para detener.

cd /d "%~dp0"
"%NODEPATH%\npm.cmd" run dev

echo Servidores detenidos.
pause
