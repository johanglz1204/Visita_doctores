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

// Obtener palabras únicas significativas para el emparejamiento
const getWords = (str) => {
  const normalized = normalize(str);
  // Lista expandida de términos genéricos que NO identifican al producto
  const stopWords = new Set([
    'tabletas', 'capsulas', 'caja', 'frasco', 'ampolletas', 'suspension', 'solucion', 'jarabe', 
    'inyectable', 'crema', 'unguento', 'gel', 'con', 'para', 'del', 'los', 'mgs', 'ml', 'pza',
    'pzas', 'tab', 'tabs', 'cap', 'caps', 'iny', 'gr', 'mcg', 'u', 'im', 'iv', 'vo', 'c', '14', 
    '28', '30', '10', '12', '15', '20', '500', '250', '100', '1g', '2g', '5g', '50', '75', '80', 
    '150', '300', '400', '600', '800', '1200', '60', '90'
  ]);
  
  return new Set(
    normalized
      .split(/[^a-z0-9]/)
      .filter(w => w.length >= 3 && !stopWords.has(w) && isNaN(w))
  );
};

// Validar si dos nombres son compatibles (la primera palabra de MySQL debe estar en PG)
const isCompatible = (strMySQL, strPG) => {
  const wordsMySQL = Array.from(getWords(strMySQL));
  const wordsPG = normalize(strPG);
  if (wordsMySQL.length === 0) return false;
  
  // La sustancia principal (primera palabra real) debe estar presente
  const mainSubstance = wordsMySQL[0];
  return wordsPG.includes(mainSubstance);
};

// Calcular qué tanto se parecen por palabras comunes significativas
const getOverlapScore = (strMySQL, strPG) => {
  if (!isCompatible(strMySQL, strPG)) return 0; // Si el nombre base no coincide, abortamos

  const wordsMySQL = getWords(strMySQL);
  const wordsPG = getWords(strPG);
  if (wordsMySQL.size === 0) return 0;
  
  let matches = 0;
  for (const word of wordsMySQL) {
    if (wordsPG.has(word)) matches++;
  }
  return matches / wordsMySQL.size;
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
    matched_list: [],
    unmatched_list: [],
    error_list: [],
    source: externalData ? 'PUSH' : 'PULL'
  };

  try {
    // Asegurar que la tabla de logs tenga la columna matched_list (Migración rápida)
    try {
      if (process.env.DATABASE_URL) {
        await db.query("ALTER TABLE mysql_sync_logs ADD COLUMN IF NOT EXISTS matched_list JSONB DEFAULT '[]'::jsonb");
      }
    } catch (_) {}

    let mysqlRows = [];
    
    if (externalData && Array.isArray(externalData)) {
      // Caso PUSH: Ya recibimos los datos
      mysqlRows = externalData;
      console.log(`📥 [MySQL Sync (PUSH)] RECIBIDO: ${mysqlRows.length} filas.`);
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

      // Paso 1: Match por Código (Exacto)
      if (rowCode) {
        const found = pgCodeMap.get(rowCode);
        if (found && isCompatible(row.nombre, found.name)) {
          product = found;
        }
      }

      // Paso 2: Match por Nombre (Normalizado Exacto)
      if (!product) {
        const found = pgNameMap.get(nombreNorm);
        if (found && isCompatible(row.nombre, found.name)) {
          product = found;
        }
      }

      // Paso 3: Match por Nombre (Limpio Alfa-numérico)
      if (!product) {
        const found = pgHardNameMap.get(nombreHard);
        if (found && isCompatible(row.nombre, found.name)) {
          product = found;
        }
      }

      // Paso 4: Match por Contenido (Contains)
      if (!product && nombreHard.length >= 6) {
        for (const pgProd of pgProducts) {
          const pgHard = hardClean(pgProd.name);
          if (pgHard.includes(nombreHard) || nombreHard.includes(pgHard)) {
             // VALIDACIÓN DE SEGURIDAD: La sustancia principal debe coincidir
             if (isCompatible(row.nombre, pgProd.name)) {
               product = pgProd;
               break;
             }
          }
        }
      }

      // Paso 5: Match por Superposición de palabras (Word Overlap)
      if (!product) {
        let bestScore = 0;
        let bestMatch = null;
        for (const pgProd of pgProducts) {
          const score = getOverlapScore(row.nombre, pgProd.name);
          if (score >= 0.6 && score > bestScore) { // Al menos 60% de palabras coinciden
            bestScore = score;
            bestMatch = pgProd;
          }
        }
        product = bestMatch;
      }
      
      // AUTO-LEARN y Tracking
      if (product) {
        stats.matched++;
        const stockVal = Math.round(parseFloat(row.existencia) || 0);
        const minVal = Math.round(parseFloat(row.minimo) || 0);

        stats.matched_list.push({
          mysql: row.nombre,
          pg: product.name,
          codigo: row.codigo,
          stock: stockVal
        });

        if (!product.barcode && row.codigo) {
           try {
             await db.query('UPDATE products SET barcode = $1 WHERE id = $2', [row.codigo.toString().trim(), product.id]);
             product.barcode = row.codigo.toString().trim();
           } catch (e) {}
        }

        try {
          // Actualización de stock
          console.log(`📡 [DB Update] Intentando actualizar "${product.name}" (ID: ${product.id}) con stock: ${stockVal}`);
          
          const prodUpdate = await db.query(
            `UPDATE products 
             SET stock = $1, min_stock = $2, updated_at = NOW() 
             WHERE id = $3`,
            [stockVal, minVal, product.id]
          );
          
          const stockUpdate = await db.query(
            `UPDATE inventory_stocks
             SET current_stock = $1,
                 target_stock  = CASE WHEN $2 > 0 THEN $2 ELSE target_stock END,
                 updated_at    = NOW()
             WHERE product_id = $3`,
            [stockVal, minVal, product.id]
          );

          console.log(`✅ [DB Update] Filas afectadas: Products(${prodUpdate.rowCount}), Stocks(${stockUpdate.rowCount})`);
          
          stats.updated++;
          if (stats.updated <= 5) {
            console.log(`✅ [Sync Debug] "${row.nombre}" -> "${product.name}" (Stock: ${stockVal})`);
          }
        } catch (updateErr) {
          console.error(`❌ [DB Update Error] "${product.name}":`, updateErr.message);
          stats.errors++;
          stats.error_list.push(`${row.nombre}: ${updateErr.message}`);
        }
      } else {
        stats.unmatched++;
        stats.unmatched_list.push({
          codigo: row.codigo,
          nombre: row.nombre,
          existencia: row.existencia,
        });
      }
    }

    const durationMs = Date.now() - startTime;

    // 4. Guardar log en PostgreSQL
    await db.query(
      `INSERT INTO mysql_sync_logs
         (total_mysql, matched, updated, unmatched, errors, duration_ms, unmatched_list, matched_list)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        stats.total_mysql,
        stats.matched,
        stats.updated,
        stats.unmatched,
        stats.errors,
        durationMs,
        JSON.stringify(stats.unmatched_list),
        JSON.stringify(stats.matched_list.slice(0, 100))
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
