@echo off
echo ===================================================
echo        ACTUALIZANDO SICOIN EN EL SERVIDOR
echo ===================================================
echo.
echo [1/2] Deteniendo el servicio SICOIN...
nssm stop SICOIN
timeout /t 5 /nobreak >nul
echo      Servicio detenido correctamente.
echo.
echo [2/2] Reiniciando el servicio con los archivos nuevos...
:: Nota: los archivos ya deben estar copiados por Desplegar_SICOIN.bat
:: (via red) antes de correr este script. Si en vez de eso usaste el
:: metodo viejo por Drive, reemplaza los archivos manualmente aqui
:: antes de continuar.
nssm start SICOIN
timeout /t 5 /nobreak >nul
echo.
echo ===================================================
echo   SICOIN ACTUALIZADO CORRECTAMENTE!
echo   El sistema ya esta disponible en:
echo   http://192.168.1.199:3000
echo ===================================================
echo.
pause
