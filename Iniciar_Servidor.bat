@echo off
:: Este script inicia unicamente el servidor backend (sin la ventana gráfica de Electron)
cd /d "%~dp0"
echo Iniciando servidor SICOIN en segundo plano...
:: Usamos Node directamente para levantar el backend en el puerto 3000
node server/index.js
