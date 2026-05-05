@echo off
title AGENTE DE SINCRONIZACION AUTOMATICA - VisitaDoctores
echo ======================================================
echo    INICIANDO AGENTE DE ACTUALIZACION CADA HORA
echo ======================================================
cd scripts
node background_sync.js
pause
