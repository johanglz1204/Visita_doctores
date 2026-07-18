@echo off
title AGENTE DE SINCRONIZACION AUTOMATICA - SICOIN
echo ======================================================
echo    INICIANDO AGENTE DE ACTUALIZACION CADA HORA
echo ======================================================
cd scripts
node background_sync.js
pause
