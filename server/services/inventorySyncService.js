/**
 * inventorySyncService.js
 * Sincroniza existencias desde MySQL (dbsicofa / tblclsarticulo, sucursal Tampico)
 * hacia PostgreSQL (inventory_stocks) cada vez que se invoca.
 *
 * Lógica de matching:
 *  - Normaliza STRNOMBRE (MySQL) y products.name (PostgreSQL) a minúsculas sin acentos.
 *  - Actualiza current_stock e target_stock en TODOS los inventory_stocks
 *    que referencien ese product_id.
 *  - Registra el resultado en mysql_sync_logs.
 */

const { queryMySQL } = require('../mysqlDb');
const db = require('../db');

// Normalizar cadenas: minúsculas, sin acentos, sin espacios extra
const normalize = (str) => {
  if (!str) return '';
  return str
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

/**
 * Query principal que el usuario usa para extraer existencias de Tampico (INTIDSUCURSAL=2)
 */
const MYSQL_INVENTORY_QUERY = `
  SELECT
    stramecop        AS codigo,
    STRNOMBRE        AS nombre,
    INTEXISTENCIA    AS existencia,
    INTMINIMO        AS minimo
  FROM tblclsarticulo
  WHERE INTEXISTENCIA <> 0
    AND INTIDSUCURSAL = 2
`;

/**
 * Ejecuta la sincronización completa.
 * @param {any[]} externalData - (Opcional) Datos enviados desde un agente externo (Push Sync)
 * @returns {Promise<object>} Estadísticas del sync
 */
async function syncMySQLInventory(externalData = null) {
  const startTime = Date.now();
  const stats = {
    total_mysql: 0,
    matched: 0,
    updated: 0,
    unmatched: 0,
    errors: 0,
    unmatched_list: [],
    error_list: [],
    source: externalData ? 'PUSH' : 'PULL'
  };

  try {
    let mysqlRows = [];
    
    if (externalData && Array.isArray(externalData)) {
      // Caso PUSH: Ya recibimos los datos
      mysqlRows = externalData;
      console.log(`📥 [MySQL Sync (PUSH)] Procesando ${mysqlRows.length} artículos recibidos...`);
    } else {
      // Caso PULL: Intentar consultar MySQL (puede fallar por timeout)
      console.log('🔄 [MySQL Sync (PULL)] Consultando existencias en dbsicofa...');
      mysqlRows = await queryMySQL(MYSQL_INVENTORY_QUERY);
    }

    stats.total_mysql = mysqlRows.length;

    // 2. Cargar todos los productos de PostgreSQL en memoria
    const { rows: pgProducts } = await db.query('SELECT id, name FROM products');
    const pgProductMap = new Map();
    for (const p of pgProducts) {
      pgProductMap.set(normalize(p.name), p.id);
    }

    // 3. Procesar cada artículo
    for (const row of mysqlRows) {
      const nombreNorm = normalize(row.nombre);
      const productId = pgProductMap.get(nombreNorm);

      if (!productId) {
        stats.unmatched++;
        stats.unmatched_list.push({
          codigo: row.codigo,
          nombre: row.nombre,
          existencia: row.existencia,
        });
        continue;
      }

      stats.matched++;

      try {
        const result = await db.query(
          `UPDATE inventory_stocks
           SET current_stock = $1,
               target_stock  = CASE WHEN $2 > 0 THEN $2 ELSE target_stock END,
               updated_at    = NOW()
           WHERE product_id = $3`,
          [
            Math.max(0, parseInt(row.existencia) || 0),
            Math.max(0, parseInt(row.minimo) || 0),
            productId,
          ]
        );
        if (result.rowCount > 0) {
          stats.updated++;
        }
      } catch (updateErr) {
        stats.errors++;
        stats.error_list.push(`${row.nombre}: ${updateErr.message}`);
      }
    }

    const durationMs = Date.now() - startTime;

    // 4. Guardar log en PostgreSQL
    await db.query(
      `INSERT INTO mysql_sync_logs
         (total_mysql, matched, updated, unmatched, errors, duration_ms, unmatched_list)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        stats.total_mysql,
        stats.matched,
        stats.updated,
        stats.unmatched,
        stats.errors,
        durationMs,
        JSON.stringify(stats.unmatched_list),
      ]
    );

    console.log(
      `✅ [MySQL Sync (${stats.source})] Completado en ${durationMs}ms → ` +
      `${stats.updated} actualizados, ${stats.unmatched} sin match`
    );

    return { success: true, duration_ms: durationMs, ...stats };

  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errMsg = err.message || err.code || String(err);
    console.error(`❌ [MySQL Sync (${stats.source})] Error fatal:`, errMsg);

    try {
      await db.query(
        `INSERT INTO mysql_sync_logs
           (total_mysql, matched, updated, unmatched, errors, duration_ms, unmatched_list)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [0, 0, 0, 0, 1, durationMs, JSON.stringify([{ error: errMsg }])]
      );
    } catch (_) {}

    return { success: false, error: errMsg, duration_ms: durationMs, ...stats };
  }
}

module.exports = { syncMySQLInventory };
