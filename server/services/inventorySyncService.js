const { queryMySQL } = require('../mysqlDb');
const db = require('../db');
const { normalize, hardClean, cleanForDisplay } = require('../utils/stringUtils');

/**
 * Limpia el código de barras (elimina espacios y ceros a la izquierda si es necesario)
 */
function cleanCode(code) {
  if (!code) return '';
  return code.toString().trim();
}

/**
 * Encuentra el mejor producto en PostgreSQL para un registro de MySQL
 */
function findBestMatch(row, pgProducts, { pgCodeMap, pgNameMap, pgHardNameMap, aliasMap }) {
  const code = cleanCode(row.codigo);
  const nombreNorm = normalize(row.nombre);
  const nombreHard = hardClean(row.nombre);

  // Paso 0: Alias manuales (Prioridad Máxima)
  if (aliasMap.has(nombreNorm)) {
    const aliasedId = aliasMap.get(nombreNorm);
    return pgProducts.find(p => p.id === aliasedId);
  }

  // Paso 1: Match por Código de Barras
  if (code) {
    const found = pgCodeMap.get(code);
    if (found) return found;
  }

  // Paso 2: Match por Nombre (Normalizado Exacto)
  const foundByName = pgNameMap.get(nombreNorm);
  if (foundByName) return foundByName;

  // Paso 3: Match por Nombre (Limpio Alfa-numérico)
  const foundByHard = pgHardNameMap.get(nombreHard);
  if (foundByHard) return foundByHard;

  return null;
}

/**
 * Query principal que el usuario usa para extraer existencias detalladas por sucursal
 * Ahora traemos TODAS las sucursales para cualquier producto que tenga existencia en al menos una,
 * esto permite capturar el "Ranking Cadena" (el mejor ranking de cualquier sucursal).
 */
const MYSQL_INVENTORY_QUERY = `
  SELECT
    stramecop        AS codigo,
    STRNOMBRE        AS nombre,
    INTEXISTENCIA    AS existencia,
    INTMINIMO        AS minimo,
    STRRANKING       AS ranking,
    INTIDSUCURSAL    AS sucursal_id
  FROM tblclsarticulo
  WHERE stramecop IN (
    SELECT DISTINCT stramecop 
    FROM tblclsarticulo 
    WHERE INTIDSUCURSAL IN (1, 2, 6, 13, 16) 
      AND (INTEXISTENCIA <> 0 OR STRRANKING NOT IN ('Z', '0', ''))
  )
  AND INTIDSUCURSAL IN (1, 2, 6, 13, 16)
`;

const BRANCH_MAP = {
  1: 'MATRIZ',
  2: 'TAMPICO',
  6: 'CIVIL',
  13: 'EJERCITO',
  16: 'CURVA TEXAS'
};

/**
 * Query para obtener resumen de ventas de los últimos 90 días (3 meses) para cálculo de Rankings
 */
const MYSQL_SALES_SUMMARY_QUERY = `
  SELECT 
    t1.stramecop AS barcode,
    SUM(CASE WHEN t2.dtmfecha >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN t1.intpzas ELSE 0 END) as m1,
    SUM(CASE WHEN t2.dtmfecha >= DATE_SUB(NOW(), INTERVAL 60 DAY) AND t2.dtmfecha < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN t1.intpzas ELSE 0 END) as m2,
    SUM(CASE WHEN t2.dtmfecha >= DATE_SUB(NOW(), INTERVAL 90 DAY) AND t2.dtmfecha < DATE_SUB(NOW(), INTERVAL 60 DAY) THEN t1.intpzas ELSE 0 END) as m3
  FROM tblclsdetventa t1
  INNER JOIN tblclsventa t2 ON t1.intidsucursal = t2.intidsucursal AND t1.intnumeroventa = t2.intnumeroventa
  WHERE t2.dtmfecha >= DATE_SUB(NOW(), INTERVAL 90 DAY)
    AND t2.intidsucursal IN (1, 2, 6, 13, 16)
    AND t2.INTCLIENTEID NOT IN (80000, 100000, 99999, 100001, 75000)
  GROUP BY t1.stramecop
`;

/**
 * Ejecuta la sincronización completa.
 * @param {any[]} externalData - (Opcional) Datos enviados desde un agente externo (Push Sync)
 * @returns {Promise<object>} Estadísticas del sync
 */
async function syncMySQLInventory(externalData = null) {
  const startTime = Date.now();
  const stats = {
    synced_at: new Date(),
    total_mysql: 0,
    matched: 0,
    updated: 0,
    unmatched: 0,
    errors: 0,
    duration_ms: 0,
    unmatched_list: [],
    matched_list: []
  };

  try {
    try {
      await db.query("ALTER TABLE mysql_sync_logs ADD COLUMN matched_list TEXT DEFAULT '[]'");
    } catch (_) {}

    let mysqlRows = [];
    let salesRows = [];
    
    if (externalData && Array.isArray(externalData)) {
      mysqlRows = externalData;
    } else {
      console.log('🔄 [MySQL Sync] Consultando ventas para cálculo de rankings...');
      salesRows = await queryMySQL(MYSQL_SALES_SUMMARY_QUERY);
      console.log('🔄 [MySQL Sync] Consultando existencias multisucursal...');
      mysqlRows = await queryMySQL(MYSQL_INVENTORY_QUERY);
    }

    // Procesar mapa de ventas
    const salesMap = new Map();
    for (const s of salesRows) {
      salesMap.set(String(s.barcode), {
        m1: parseInt(s.m1) || 0,
        m2: parseInt(s.m2) || 0,
        m3: parseInt(s.m3) || 0
      });
    }

    stats.total_mysql = mysqlRows.length;

    // 1. Agrupar filas de MySQL por código/nombre para tener un objeto consolidado
    const mysqlProducts = new Map();
    const rankingOrder = { 'AA': 6, 'A': 5, 'B': 4, 'C': 3, 'E': 2, 'Z': 1, '0': 1, '': 0 };

    for (const row of mysqlRows) {
      const key = row.codigo || row.nombre;
      if (!mysqlProducts.has(key)) {
        mysqlProducts.set(key, {
          ...row,
          stock_by_branch: {}
        });
      } else {
        // Ranking de MySQL como fallback (nos quedamos con el mejor)
        const current = mysqlProducts.get(key);
        const currentScore = rankingOrder[current.ranking] || 0;
        const newScore = rankingOrder[row.ranking] || 0;
        if (newScore > currentScore) {
          current.ranking = row.ranking;
        }
      }
      
      const branchName = BRANCH_MAP[row.sucursal_id];
      if (branchName) {
        const consolidated = mysqlProducts.get(key);
        consolidated.stock_by_branch[branchName] = (consolidated.stock_by_branch[branchName] || 0) + (parseInt(row.existencia) || 0);
      }
    }

    // 2. Cargar todos los productos de SQLite
    const { rows: pgProducts } = await db.query('SELECT id, name, barcode, stock, stock_by_branch, ranking FROM products');
    const pgCodeMap = new Map();
    const pgNameMap = new Map();
    const pgHardNameMap = new Map();
    
    for (const p of pgProducts) {
      if (p.barcode) pgCodeMap.set(cleanCode(p.barcode), p);
      pgNameMap.set(normalize(p.name), p);
      pgHardNameMap.set(hardClean(p.name), p);
    }

    // Alias
    const aliasMap = new Map();
    try {
      const { rows: aliases } = await db.query('SELECT alias_name, product_id FROM product_aliases');
      for (const a of aliases) aliasMap.set(normalize(a.alias_name), a.product_id);
    } catch (_) {}

    // 3. Procesar cada artículo consolidado
    for (const row of mysqlProducts.values()) {
      const product = findBestMatch(row, pgProducts, { pgCodeMap, pgNameMap, pgHardNameMap, aliasMap });
      
      if (product) {
        stats.matched++;
        const totalStock = Object.values(row.stock_by_branch).reduce((a, b) => a + b, 0);
        const minVal = Math.round(parseFloat(row.minimo) || 0);
        const sbbJson = JSON.stringify(row.stock_by_branch);

        // --- CÁLCULO DE RANKING CADENA ---
        const s = salesMap.get(String(row.codigo)) || { m1: 0, m2: 0, m3: 0 };
        const monthsWithSales = (s.m1 > 0 ? 1 : 0) + (s.m2 > 0 ? 1 : 0) + (s.m3 > 0 ? 1 : 0);
        
        let rankingVal = 'Z';
        if (s.m1 >= 10 && s.m2 >= 10 && s.m3 >= 10) {
          rankingVal = 'AA';
        } else if (s.m1 >= 1 && s.m2 >= 1 && s.m3 >= 1) {
          rankingVal = 'A';
        } else if (monthsWithSales === 2) {
          rankingVal = 'B';
        } else if (monthsWithSales === 1) {
          rankingVal = 'C';
        } else {
          rankingVal = totalStock > 0 ? 'E' : 'Z';
        }

        // Si el ranking calculado es Z pero MySQL dice que es mejor, respetamos MySQL
        const mysqlRank = row.ranking || 'Z';
        if (rankingOrder[mysqlRank] > rankingOrder[rankingVal]) {
          rankingVal = mysqlRank;
        }

        stats.matched_list.push({
          mysql: row.nombre,
          pg: product.name,
          codigo: row.codigo,
          stock: totalStock
        });

        // Solo actualizar si algo cambió
        const currentSbb = product.stock_by_branch || '{}';
        if (parseInt(product.stock) !== totalStock || currentSbb !== sbbJson || product.ranking !== rankingVal) {
          try {
            await db.query(
              'UPDATE products SET stock = $1, stock_by_branch = $2, min_stock = $3, ranking = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5',
              [totalStock, sbbJson, minVal, rankingVal, product.id]
            );
            stats.updated++;
          } catch (e) {
            console.error(`❌ [MySQL Sync] Error actualizando ${product.name}:`, e.message);
            stats.errors++;
          }
        }
      } else {
        stats.unmatched++;
        stats.unmatched_list.push({
          nombre: row.nombre,
          codigo: row.codigo,
          existencia: Object.values(row.stock_by_branch).reduce((a, b) => a + b, 0)
        });
      }
    }

    // 4. Guardar Log
    stats.duration_ms = Date.now() - startTime;
    await db.query(
      `INSERT INTO mysql_sync_logs (total_mysql, matched, updated, unmatched, errors, duration_ms, unmatched_list, matched_list)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [stats.total_mysql, stats.matched, stats.updated, stats.unmatched, stats.errors, stats.duration_ms, JSON.stringify(stats.unmatched_list), JSON.stringify(stats.matched_list)]
    );

    return { success: true, ...stats };

  } catch (err) {
    console.error('❌ [MySQL Sync] Error fatal:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { syncMySQLInventory };
