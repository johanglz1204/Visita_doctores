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

// Normalización agresiva: SOLO letras y números (para comparar nombres muy distintos en formato)
const hardClean = (str) => {
  return normalize(str).replace(/[^a-z0-9]/g, '');
};

// Limpiar códigos: quitar ceros iniciales y espacios
const cleanCode = (code) => {
  if (!code) return '';
  let c = code.toString().trim();
  // Quitar ceros iniciales si son más de 3 (ej. 0000123 -> 123)
  // Pero mantenemos ceros si el código es corto (ej. 001)
  if (c.length > 5) {
    c = c.replace(/^0+/, '');
  }
  return c;
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

    // 2. Cargar todos los productos de PostgreSQL en memoria para matching rápido
    const { rows: pgProducts } = await db.query('SELECT id, name, barcode FROM products');
    const pgCodeMap = new Map();         // code -> product
    const pgNameMap = new Map();         // normalized(name) -> product
    const pgHardNameMap = new Map();     // hardClean(name) -> product
    
    for (const p of pgProducts) {
      if (p.barcode) pgCodeMap.set(cleanCode(p.barcode), p);
      pgNameMap.set(normalize(p.name), p);
      pgHardNameMap.set(hardClean(p.name), p);
    }

    // 3. Procesar cada artículo
    for (const row of mysqlRows) {
      const nombreNorm = normalize(row.nombre);
      const nombreHard = hardClean(row.nombre);
      const rowCode = cleanCode(row.codigo);
      
      let product = null;

      // Prioridad 1: Match por Código (limpio de ceros iniciales)
      if (rowCode) {
        product = pgCodeMap.get(rowCode);
      }

      // Prioridad 2: Match por Nombre Normalizado
      if (!product) {
        product = pgNameMap.get(nombreNorm);
      }

      // Prioridad 3: Match Agresivo (solo letras y números)
      if (!product) {
        product = pgHardNameMap.get(nombreHard);
      }
      
      // AUTO-LEARN: Si lo encontramos por nombre y no tiene barcode en PG, guardamos el código
      if (product && !product.barcode && row.codigo) {
        try {
          await db.query('UPDATE products SET barcode = $1 WHERE id = $2', [row.codigo.toString().trim(), product.id]);
          product.barcode = row.codigo.toString().trim();
          console.log(`✨ [MySQL Sync] Código ${row.codigo} vinculado a "${product.name}"`);
        } catch (codeErr) {
          console.warn(`⚠️ Error vinculando código a ${product.name}:`, codeErr.message);
        }
      }

      if (!product) {
        stats.unmatched++;
        stats.unmatched_list.push({
          codigo: row.codigo,
          nombre: row.nombre,
          existencia: row.existencia,
        });
        continue;
      }

      const productId = product.id;
      stats.matched++;

      try {
        // 1. ACTUALIZAR STOCK GLOBAL EN TABLA PRODUCTS
        await db.query(
          `UPDATE products 
           SET stock = $1, min_stock = $2, updated_at = NOW() 
           WHERE id = $3`,
          [
            Math.max(0, parseInt(row.existencia) || 0),
            Math.max(0, parseInt(row.minimo) || 0),
            productId
          ]
        );

        // 2. ACTUALIZAR STOCK POR DOCTOR SI EXISTE
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
        
        // Contamos como actualizado si se actualizó el global (siempre llega aquí si hay match)
        stats.updated++;
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
