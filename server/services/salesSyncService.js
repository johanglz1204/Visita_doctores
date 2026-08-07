/**
 * salesSyncService.js
 * 
 * Sincroniza ventas desde MySQL (dbsicofa) hacia SQLite local.
 * Lee las ventas que tienen un doctor asociado (INTDOCTORID > 0) y las
 * inserta en la tabla local sales_history, evitando duplicados.
 * 
 * SOLO LECTURA contra MySQL.
 */
const { queryMySQL } = require('../mysqlDb');
const db = require('../db');
const { normalize, cleanForDisplay } = require('../utils/stringUtils');

const BRANCH_MAP = {
  1: 'MATRIZ',
  2: 'TAMPICO',
  6: 'CIVIL',
  13: 'EJERCITO',
  16: 'CURVA TEXAS'
};

/**
 * Query principal: trae ventas con doctor asociado de los últimos N días.
 * Junta tblclsventa + tblclsdoctor + tblclsdetventa + tblclsarticulo
 */
const MYSQL_SALES_QUERY = `
  SELECT 
    v.INTIDSUCURSAL    AS sucursal_id,
    v.INTNUMEROVENTA   AS venta_id,
    v.DTMFECHA         AS fecha,
    v.INTDOCTORID      AS doctor_id_mysql,
    TRIM(d.STRNOMBRE)  AS doctor_nombre1,
    TRIM(COALESCE(d.STRNOMBRE2, ''))  AS doctor_nombre2,
    TRIM(COALESCE(d.APPATERNO, ''))   AS doctor_ap_paterno,
    TRIM(COALESCE(d.APMATERNO, ''))   AS doctor_ap_materno,
    TRIM(COALESCE(d.STRESPECIALIDAD, '')) AS doctor_especialidad,
    TRIM(COALESCE(d.STRTELEFONO, ''))    AS doctor_telefono,
    dv.stramecop       AS producto_codigo,
    dv.intpzas         AS cantidad,
    TRIM(a.STRNOMBRE)  AS producto_nombre
  FROM tblclsventa v
  INNER JOIN tblclsdoctor d ON v.INTDOCTORID = d.INTDOCTORID
  LEFT JOIN tblclsdetventa dv 
    ON v.INTIDSUCURSAL = dv.intidsucursal 
    AND v.INTNUMEROVENTA = dv.intnumeroventa
  LEFT JOIN tblclsarticulo a 
    ON dv.stramecop = a.stramecop 
    AND dv.intidsucursal = a.INTIDSUCURSAL
  WHERE v.INTDOCTORID > 0
    AND v.DTMFECHA >= DATE_SUB(NOW(), INTERVAL ? DAY)
    AND v.INTIDSUCURSAL IN (1, 2, 6, 13, 16)
  ORDER BY v.DTMFECHA DESC
`;

/**
 * Normaliza el nombre completo del doctor para comparaciones
 */
function buildDoctorName(row) {
  const parts = [row.doctor_nombre1, row.doctor_nombre2, row.doctor_ap_paterno, row.doctor_ap_materno]
    .filter(p => p && p.trim().length > 0);
  return parts.join(' ').toUpperCase().trim();
}

/**
 * Limpia un nombre para comparación (sin acentos, sin DR/DRA, solo alfanumérico, minúsculas)
 */
function cleanName(str) {
  if (!str) return '';
  return str
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(DR|DRA)\.?\s+/i, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

/**
 * Ejecuta la sincronización de ventas desde MySQL.
 * @param {number} days - Cuántos días hacia atrás sincronizar (default: 60)
 * @returns {Promise<object>} Estadísticas del sync
 */
async function syncMySQLSales(days = 60) {
  const startTime = Date.now();
  const stats = {
    synced_at: new Date().toISOString(),
    total_mysql_rows: 0,
    new_records: 0,
    skipped_duplicates: 0,
    doctors_created: 0,
    doctors_matched: 0,
    products_unmatched: 0,
    errors: 0,
    duration_ms: 0,
  };

  try {
    // 1. Query MySQL
    console.log(`📥 [Sales Sync] Consultando ventas de los últimos ${days} días desde MySQL...`);
    const mysqlRows = await queryMySQL(MYSQL_SALES_QUERY, [days]);
    stats.total_mysql_rows = mysqlRows.length;
    console.log(`📊 [Sales Sync] ${mysqlRows.length} líneas de venta encontradas con doctor asociado.`);

    if (mysqlRows.length === 0) {
      stats.duration_ms = Date.now() - startTime;
      return { success: true, ...stats };
    }

    // 2. Load all local doctors for matching
    const { rows: localDoctors } = await db.query('SELECT id, name, specialty, phone FROM doctors');
    const doctorMap = new Map();
    for (const doc of localDoctors) {
      doctorMap.set(cleanName(doc.name), doc);
    }

    // 3. Load all local products for matching by barcode and name
    const { rows: localProducts } = await db.query('SELECT id, name, barcode FROM products');
    const productByCode = new Map();
    const productByName = new Map();
    for (const prod of localProducts) {
      if (prod.barcode) productByCode.set(prod.barcode.trim(), prod);
      productByName.set(cleanName(prod.name), prod);
    }

    // 4. Check existing mysql_ref values to avoid duplicates
    const { rows: existingRefs } = await db.query(
      "SELECT mysql_ref FROM sales_history WHERE mysql_ref IS NOT NULL AND mysql_ref != ''"
    );
    const existingRefSet = new Set(existingRefs.map(r => r.mysql_ref));

    // 5. Process each row
    let batch = [];
    const doctorCache = new Map(); // mysql_doctor_id -> local_doctor_id

    for (const row of mysqlRows) {
      try {
        // Build unique reference key: sucursal-venta-producto
        const mysqlRef = `${row.sucursal_id}-${row.venta_id}-${row.producto_codigo || 'NA'}`;

        // Skip if already synced
        if (existingRefSet.has(mysqlRef)) {
          stats.skipped_duplicates++;
          continue;
        }

        // --- Match/Create Doctor ---
        let localDoctorId = doctorCache.get(row.doctor_id_mysql);
        
        if (!localDoctorId) {
          const fullName = buildDoctorName(row);
          const cleaned = cleanName(fullName);
          
          const existingDoc = doctorMap.get(cleaned);
          if (existingDoc) {
            localDoctorId = existingDoc.id;
            stats.doctors_matched++;

            // Update specialty and phone if missing locally
            if (row.doctor_especialidad && !existingDoc.specialty) {
              await db.query('UPDATE doctors SET specialty = $1 WHERE id = $2', 
                [cleanForDisplay(row.doctor_especialidad), localDoctorId]);
            }
            if (row.doctor_telefono && !existingDoc.phone) {
              await db.query('UPDATE doctors SET phone = $1 WHERE id = $2', 
                [row.doctor_telefono.trim(), localDoctorId]);
            }
          } else {
            // Create new doctor
            const displayName = cleanForDisplay(fullName);
            const { rows: newDoc } = await db.query(
              'INSERT INTO doctors (name, specialty, phone) VALUES ($1, $2, $3) RETURNING id',
              [displayName, cleanForDisplay(row.doctor_especialidad) || '', row.doctor_telefono?.trim() || '']
            );
            localDoctorId = newDoc[0].id;
            doctorMap.set(cleaned, { id: localDoctorId, name: displayName });
            stats.doctors_created++;
            console.log(`   👨‍⚕️ Nuevo doctor creado: "${displayName}" (ID ${localDoctorId})`);
          }
          
          doctorCache.set(row.doctor_id_mysql, localDoctorId);
        }

        // --- Match Product ---
        let localProductId = null;
        if (row.producto_codigo) {
          const byCode = productByCode.get(row.producto_codigo.trim());
          if (byCode) {
            localProductId = byCode.id;
          }
        }
        if (!localProductId && row.producto_nombre) {
          const byName = productByName.get(cleanName(row.producto_nombre));
          if (byName) {
            localProductId = byName.id;
          }
        }
        if (!localProductId) {
          stats.products_unmatched++;
        }

        // --- Format date ---
        const saleDate = row.fecha instanceof Date 
          ? row.fecha.toISOString().split('T')[0]
          : String(row.fecha).split('T')[0];
        
        const sucursalName = BRANCH_MAP[row.sucursal_id] || `SUC-${row.sucursal_id}`;

        // --- Insert ---
        batch.push({
          doctor_id: localDoctorId,
          product_id: localProductId,
          quantity: row.cantidad || 1,
          sale_date: saleDate,
          sucursal: sucursalName,
          raw_text: `[MySQL] ${row.producto_nombre || row.producto_codigo || 'N/A'} x${row.cantidad || 1}`,
          source: 'mysql',
          mysql_ref: mysqlRef,
        });

        existingRefSet.add(mysqlRef); // prevent within-batch duplicates
        stats.new_records++;

        // Flush batch every 100 records
        if (batch.length >= 100) {
          await insertBatch(batch);
          batch = [];
        }
      } catch (err) {
        stats.errors++;
        console.error(`   ❌ Error procesando fila:`, err.message);
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      await insertBatch(batch);
    }

    stats.duration_ms = Date.now() - startTime;
    console.log(`✅ [Sales Sync] Completado en ${stats.duration_ms}ms:`);
    console.log(`   📈 Nuevos: ${stats.new_records} | Duplicados: ${stats.skipped_duplicates}`);
    console.log(`   👨‍⚕️ Doctores creados: ${stats.doctors_created} | Matcheados: ${stats.doctors_matched}`);
    console.log(`   ⚠️  Productos sin match: ${stats.products_unmatched} | Errores: ${stats.errors}`);

    // Log the sync
    try {
      await db.query(
        `INSERT INTO sales_sync_logs (synced_at, total_mysql, new_records, skipped_duplicates, doctors_created, doctors_matched, products_unmatched, errors, duration_ms, days_back)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [stats.synced_at, stats.total_mysql_rows, stats.new_records, stats.skipped_duplicates, 
         stats.doctors_created, stats.doctors_matched, stats.products_unmatched, stats.errors, stats.duration_ms, days]
      );
    } catch (e) {
      console.warn('⚠️ Could not save sales sync log:', e.message);
    }

    return { success: true, ...stats };
  } catch (err) {
    stats.duration_ms = Date.now() - startTime;
    console.error('❌ [Sales Sync] Error fatal:', err.message);
    return { success: false, error: err.message, ...stats };
  }
}

/**
 * Inserta un lote de registros en sales_history
 */
async function insertBatch(batch) {
  for (const rec of batch) {
    try {
      await db.query(
        `INSERT INTO sales_history (doctor_id, product_id, quantity, sale_date, sucursal, raw_text, source, mysql_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [rec.doctor_id, rec.product_id, rec.quantity, rec.sale_date, rec.sucursal, rec.raw_text, rec.source, rec.mysql_ref]
      );
    } catch (err) {
      // Likely duplicate constraint - skip silently
      if (!err.message.includes('UNIQUE constraint')) {
        console.warn(`   ⚠️ Insert error: ${err.message}`);
      }
    }
  }
}

module.exports = { syncMySQLSales };
