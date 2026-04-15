/**
 * mysqlSync.js — Rutas para controlar la sincronización MySQL → PostgreSQL
 *
 * GET  /api/mysql-sync/status              → Última sync, estadísticas históricas
 * POST /api/mysql-sync/trigger             → Ejecutar sync manual desde el panel
 * GET  /api/mysql-sync/test                → Probar conexión a MySQL
 * GET  /api/mysql-sync/duplicates-preview  → Ver duplicados sin eliminar
 * POST /api/mysql-sync/cleanup-duplicates  → Eliminar duplicados
 */

const express = require('express');
const router = express.Router();
const { syncMySQLInventory } = require('../services/inventorySyncService');
const { testConnection } = require('../mysqlDb');
const db = require('../db');
const authenticate = require('../middlewares/authMiddleware');

// Prevenir ejecuciones simultáneas
let syncInProgress = false;

// GET /api/mysql-sync/status
router.get('/status', authenticate, async (req, res) => {
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
router.post('/trigger', authenticate, async (req, res) => {
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

// POST /api/mysql-sync/push — Recibir datos desde agente local (Push Sync)
router.post('/push', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const serverKey = process.env.SYNC_API_KEY;

  if (!serverKey || apiKey !== serverKey) {
    return res.status(403).json({ error: 'Acceso denegado. API Key inválida o no configurada en el servidor.' });
  }

  if (syncInProgress) {
    return res.status(409).json({ error: 'Ya hay una sincronización en progreso.' });
  }

  const { data } = req.body;
  console.log(`📡 [POST /push] Recibido paquete de: ${Object.keys(req.body || {})}`);
  if (data && Array.isArray(data)) {
    console.log(`📊 [POST /push] Tamaño de data: ${data.length} artículos.`);
  } else {
    console.error(`❌ [POST /push] Error: data no es un array o no existe.`);
  }

  syncInProgress = true;
  try {
    const result = await syncMySQLInventory(data);
    res.json({
      message: `Sincronización vía PUSH completada: ${result.updated} productos actualizados.`,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error durante el procesamiento PUSH', detail: err.message });
  } finally {
    syncInProgress = false;
  }
});

// GET /api/mysql-sync/test — Probar conexión a MySQL
router.get('/test', authenticate, async (req, res) => {
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

// GET /api/mysql-sync/duplicates-preview — Ver cuántos hay sin borrar (requiere JWT)
router.get('/duplicates-preview', authenticate, async (req, res) => {
  try {
    const { rows: dupes } = await db.query(`
      SELECT 
        LOWER(TRIM(name)) as norm_name,
        COUNT(*) as count,
        ARRAY_AGG(id ORDER BY updated_at DESC, stock DESC) as id_list
      FROM products
      GROUP BY LOWER(TRIM(name))
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `);
    
    const totalDupes = dupes.reduce((acc, g) => acc + (parseInt(g.count) - 1), 0);
    res.json({ duplicate_groups: dupes.length, duplicates_to_delete: totalDupes, groups: dupes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mysql-sync/cleanup-duplicates — Eliminar productos repetidos (requiere JWT)
router.post('/cleanup-duplicates', authenticate, async (req, res) => {
  try {
    console.log('🧹 [Cleanup] Iniciando limpieza profunda de duplicados...');
    
    // Agrupar duplicados por nombre normalizado
    const { rows: dupes } = await db.query(`
      SELECT 
        LOWER(TRIM(name)) as norm_name,
        ARRAY_AGG(id ORDER BY updated_at DESC, stock DESC) as id_list
      FROM products
      GROUP BY LOWER(TRIM(name))
      HAVING COUNT(*) > 1
    `);

    let deletedCount = 0;
    let recordsMigrated = 0;

    for (const group of dupes) {
      const [keepId, ...toDelete] = group.id_list;
      
      for (const oldId of toDelete) {
        // Migrar dependencias antes de eliminar
        const invUpdate = await db.query(
          'UPDATE inventory_stocks SET product_id = $1 WHERE product_id = $2',
          [keepId, oldId]
        );
        const salesUpdate = await db.query(
          'UPDATE sales_history SET product_id = $1 WHERE product_id = $2',
          [keepId, oldId]
        );
        await db.query('DELETE FROM products WHERE id = $1', [oldId]);
        
        recordsMigrated += (parseInt(invUpdate.rowCount) || 0) + (parseInt(salesUpdate.rowCount) || 0);
        deletedCount++;
      }
    }

    console.log(`🧹 [Cleanup] Eliminados: ${deletedCount}, Registros migrados: ${recordsMigrated}`);

    res.json({ 
      success: true, 
      message: `Limpieza completada. Se eliminaron ${deletedCount} productos duplicados y se migraron ${recordsMigrated} registros relacionados.`,
      groups_cleaned: dupes.length,
      deleted_count: deletedCount,
      records_migrated: recordsMigrated
    });
  } catch (err) {
    console.error('Error cleanup:', err);
    res.status(500).json({ error: 'Fallo en la limpieza', detail: err.message });
  }
});


module.exports = router;
