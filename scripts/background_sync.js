const { exec } = require('child_process');
const path = require('path');

const SYNC_INTERVAL = 6 * 60 * 60 * 1000; // 6 Horas en milisegundos

function log(msg) {
  const now = new Date().toLocaleString();
  console.log(`[${now}] ${msg}`);
}

function runSync() {
  log('🚀 Iniciando sincronización automática de inventario...');
  
  const scriptPath = path.join(__dirname, 'sync_inventory_mysql.js');
  
  exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
    if (error) {
      log(`❌ Error en la sincronización: ${error.message}`);
      return;
    }
    if (stderr) {
      log(`⚠️ Advertencia: ${stderr}`);
    }
    log('✅ Sincronización completada con éxito.');
    console.log(stdout);
    log(`⏳ Próxima sincronización en 60 minutos...`);
  });
}

// Primera ejecución al iniciar
runSync();

// Ciclo infinito
setInterval(runSync, SYNC_INTERVAL);

log('🛰️ Agente de Sincronización en segundo plano iniciado.');
log('📢 Mantén esta ventana abierta para actualizaciones automáticas cada hora.');
