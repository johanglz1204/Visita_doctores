/**
 * local_sync_agent.js
 * Agente de sincronización para correr localmente en la farmacia.
 * Lee desde MySQL local y envía (PUSH) a Render.
 */

// CONFIGURACIÓN (Actualiza estos datos)
const CONFIG = {
  // Datos de tu MySQL local
  mysql: {
    host: '25.45.167.83', // IP de Hamachi
    port: 3306,
    user: 'visitadoc_reader',
    password: 'VDReader2026!',
    database: 'dbsicofa'
  },
  // Datos de tu APP en Render
  render: {
    url: 'https://visita-doctores.onrender.com/api/mysql-sync/push',
    apiKey: 'VD_Secret_Sync_2026_!$#' // Debe coincidir con SYNC_API_KEY en Render
  },
  intervalMinutes: 5
};

const mysql = require('mysql2/promise');

async function runSync() {
  const now = new Date().toLocaleString();
  console.log(`\n[${now}] 🔄 Iniciando sincronización...`);
  
  let connection;
  try {
    // 1. Conectar a MySQL Local
    connection = await mysql.createConnection(CONFIG.mysql);
    
    // 2. Ejecutar Query
    const [rows] = await connection.execute(`
      SELECT
        stramecop        AS codigo,
        STRNOMBRE        AS nombre,
        INTEXISTENCIA    AS existencia,
        INTMINIMO        AS minimo
      FROM tblclsarticulo
      WHERE INTEXISTENCIA <> 0
        AND INTIDSUCURSAL = 2
    `);

    console.log(`   → Leidos ${rows.length} productos de MySQL.`);

    // 3. Enviar a Render
    const response = await fetch(CONFIG.render.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': CONFIG.render.apiKey
      },
      body: JSON.stringify({ data: rows })
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log(`   ✅ Exito: ${result.updated} productos actualizados en Render.`);
    } else {
      console.error(`   ❌ Error de Render: ${result.error}`);
    }

  } catch (err) {
    console.error(`   ❌ Error fatal: ${err.message}`);
  } finally {
    if (connection) await connection.end();
  }
}

// Bucle de ejecucion
console.log('🚀 Sincronizador Local de VisitaDoctores Iniciado');
console.log(`⏱️ Programado cada ${CONFIG.intervalMinutes} minutos.`);

runSync();
setInterval(runSync, CONFIG.intervalMinutes * 60 * 1000);
