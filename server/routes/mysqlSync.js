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
const { cleanForDisplay } = require('../utils/stringUtils');
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

    let unmatchedList = [];
    let matchedList = [];
    if (lastSync.length > 0) {
      const { rows: detail } = await db.query(`
        SELECT unmatched_list, matched_list FROM mysql_sync_logs WHERE id = $1
      `, [lastSync[0].id]);
      unmatchedList = detail[0]?.unmatched_list || [];
      matchedList = detail[0]?.matched_list || [];
    }

    res.json({
      last_sync: lastSync[0] || null,
      history,
      unmatched_list: unmatchedList,
      matched_list: matchedList,
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
    
    // PASO 1: Limpieza de nombres y recuperación de símbolos rotos (como Zinolox)
    const { rows: allProducts } = await db.query('SELECT id, name FROM products');
    let repairedCount = 0;
    let autoMergedCount = 0;

    for (const prod of allProducts) {
      const cleaned = cleanForDisplay(prod.name);
      if (cleaned !== prod.name) {
        try {
          await db.query('UPDATE products SET name = $1 WHERE id = $2', [cleaned, prod.id]);
          repairedCount++;
        } catch (err) {
          if (err.code === '23505') { // Choque de nombres tras limpieza
            const { rows: existing } = await db.query('SELECT id FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [cleaned]);
            if (existing.length > 0) {
              const keepId = existing[0].id;
              await db.query('UPDATE inventory_stocks SET product_id = $1 WHERE product_id = $2', [keepId, prod.id]);
              await db.query('UPDATE sales_history SET product_id = $1 WHERE product_id = $2', [keepId, prod.id]);
              await db.query('DELETE FROM products WHERE id = $1', [prod.id]);
              autoMergedCount++;
            }
          }
        }
      }
    }

    // PASO 2: Agrupar duplicados restantes (por normalización estándar)
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
      message: `Limpieza completada. Se repararon ${repairedCount} nombres, se fusionaron ${autoMergedCount + deletedCount} duplicados y se migraron los registros relacionados.`,
      repaired_count: repairedCount,
      merged_total: autoMergedCount + deletedCount
    });
  } catch (err) {
    console.error('Error cleanup:', err);
    res.status(500).json({ error: 'Fallo en la limpieza', detail: err.message });
  }
});

// ══════════════════════════════════════════════
// MANUAL MAPPING — Vincular productos "Sin Match" con productos existentes
// ══════════════════════════════════════════════

// POST /api/mysql-sync/map — Crear un alias manual (nombre MySQL → producto PG)
router.post('/map', authenticate, async (req, res) => {
  try {
    const { alias_name, product_id } = req.body;
    if (!alias_name || !product_id) {
      return res.status(400).json({ error: 'Se requiere alias_name y product_id' });
    }

    // Verificar que el producto existe
    const { rows: product } = await db.query('SELECT id, name FROM products WHERE id = $1', [product_id]);
    if (product.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Insertar o actualizar el alias
    await db.query(`
      INSERT INTO product_aliases (alias_name, product_id)
      VALUES ($1, $2)
      ON CONFLICT (LOWER(alias_name)) DO UPDATE SET product_id = $2, created_at = NOW()
    `, [alias_name.trim(), product_id]);

    res.json({ 
      message: `"${alias_name}" ahora se vincula con "${product[0].name}". Será reconocido automáticamente en la próxima sincronización.`,
      alias_name,
      product_id,
      product_name: product[0].name
    });
  } catch (err) {
    console.error('[Manual Map] Error:', err.message);
    res.status(500).json({ error: 'Error al crear el mapeo', detail: err.message });
  }
});

// GET /api/mysql-sync/aliases — Listar todos los alias manuales
router.get('/aliases', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT a.id, a.alias_name, a.product_id, p.name as product_name, a.created_at
      FROM product_aliases a
      JOIN products p ON a.product_id = p.id
      ORDER BY a.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/mysql-sync/aliases/:id — Eliminar un alias
router.delete('/aliases/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM product_aliases WHERE id = $1 RETURNING *', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Alias no encontrado' });
    res.json({ message: 'Alias eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mysql-sync/products-search?q=term — Buscar productos para vincular
router.get('/products-search', authenticate, async (req, res) => {
  try {
    const q = req.query.q || '';
    if (q.length < 2) return res.json([]);
    
    const { rows } = await db.query(
      `SELECT id, name, barcode, ranking, stock 
       FROM products 
       WHERE LOWER(name) LIKE $1 OR barcode LIKE $1
       ORDER BY name ASC
       LIMIT 15`,
      [`%${q.toLowerCase()}%`]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
