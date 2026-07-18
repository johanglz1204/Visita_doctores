const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let serverProcess;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "SICOIN - Sistema para el Control de Inventarios",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Ocultar la barra de menú por defecto
  Menu.setApplicationMenu(null);

  // Abrir herramientas de desarrollo para diagnóstico (Deshabilitado para producción)
  // win.webContents.openDevTools();

  // Intentar cargar la aplicación
  win.loadURL('http://localhost:3000');

  // En caso de error de carga (ej. servidor no listo), reintentar
  win.webContents.on('did-fail-load', () => {
    console.log('Reintentando conexión con el servidor local...');
    win.webContents.executeJavaScript(`document.body.innerHTML = '<h2 style="color: white; background: #333; padding: 20px; font-family: sans-serif;">Conectando con el servidor local... por favor espera.</h2>'`);
    setTimeout(() => {
      win.loadURL('http://localhost:3000');
    }, 2000);
  });
}

app.whenReady().then(() => {
  console.log('🚀 Iniciando servidor backend...');
  
  // Iniciar el servidor Express
  // Usamos fork para que corra en un proceso separado y no bloquee Electron
  serverProcess = fork(path.join(__dirname, 'server/index.js'), [], {
    env: { 
      ...process.env, 
      NODE_ENV: 'production', 
      PORT: 3000 
    },
    silent: false
  });

  serverProcess.on('message', (msg) => {
    console.log('Mensaje del servidor:', msg);
  });

  serverProcess.on('error', (err) => {
    console.error('Error en el proceso del servidor:', err);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    console.log('🛑 Cerrando servidor backend...');
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
