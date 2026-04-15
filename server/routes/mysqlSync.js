/**
 * mysqlSync.js — Rutas para controlar la sincronización MySQL → PostgreSQL
 *
 * GET  /api/mysql-sync/status   → Última sync, estadísticas históricas
 * POST /api/mysql-sync/trigger  → Ejecutar sync manual desde el panel
 * GET  /api/mysql-sync/test     → Probar conexión a MySQL
 */

const express = require('express');
const router = express.Router();
const { syncMySQLInventory } = require('../services/inventorySyncService');
const { testConnection } = require('../mysqlDb');
const db = require('../db');

// Prevenir ejecuciones simultáneas
let syncInProgress = false;

// GET /api/mysql-sync/status
router.get('/status', async (req, res) => {
  try {
    // Último sync
    const { rows: lastSync } = await db.query(`
      SELECT id, synced_at, total_mysql, matched, updated, unmatched, errors, duration_ms
      FROM mysql_sync_logs
      ORDER BY synced_at DESC
      LIMIT 1
    `);

    // Historial de los últimos 10 syncs
    const { rows: history } = await db.query(`
      SELECT id, synced_at, total_mysql, matched, updated, unmatched, errors, duration_ms
      FROM mysql_sync_logs
      ORDER BY synced_at DESC
      LIMIT 10
    `);

    // Sin match del último sync (para diagnóstico)
    let unmatchedList = [];
    if (lastSync.length > 0) {
      const { rows: detail } = await db.query(`
        SELECT unmatched_list FROM mysql_sync_logs WHERE id = $1
      `, [lastSync[0].id]);
      unmatchedList = detail[0]?.unmatched_list || [];
    }

    res.json({
      last_sync: lastSync[0] || null,
      history,
      unmatched_list: unmatchedList,
      sync_in_progress: syncInProgress,
    });
  } catch (err) {
    console.error('[MySQL Sync Status] Error:', err.message);
    res.status(500).json({ error: 'Error al obtener estado del sync' });
  }
});

// POST /api/mysql-sync/trigger — Sync manual
router.post('/trigger', async (req, res) => {
  if (syncInProgress) {
    return res.status(409).json({ error: 'Ya hay una sincronización en progreso. Intenta en unos segundos.' });
  }

  syncInProgress = true;
  try {
    const result = await syncMySQLInventory();
    res.json({
      message: `Sincronización completada: ${result.updated} productos actualizados.`,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error durante la sincronización', detail: err.message });
  } finally {
    syncInProgress = false;
  }
});

// GET /api/mysql-sync/test — Probar conexión a MySQL
router.get('/test', async (req, res) => {
  try {
    const ok = await testConnection();
    if (ok) {
      res.json({
        connected: true,
        message: `Conexión exitosa a MySQL (${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT}/${process.env.MYSQL_DATABASE})`,
      });
    } else {
      res.status(503).json({ connected: false, message: 'No se pudo conectar a MySQL' });
    }
  } catch (err) {
    res.status(503).json({ connected: false, error: err.message });
  }
});

// Setter para el flag (usado desde index.js para el cron)
router.setSyncInProgress = (val) => { syncInProgress = val; };
router.isSyncInProgress = () => syncInProgress;

module.exports = router;
