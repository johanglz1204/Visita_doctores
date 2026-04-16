@echo off
echo Sincronizando cambios con GitHub...
git add .
git commit -m "feat: sincronizacion automatica de rankings"
git push origin master
echo.
echo Cambios subidos. Ahora puedes ir a Render a desplegar.
pause
