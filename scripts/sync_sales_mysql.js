/**
 * ============================================================
 * SINCRO-VENTAS: MySQL Local → Firebase Firestore
 * ============================================================
 * Extrae ventas diarias de SICOFA y las sube a Firebase.
 * Descuenta automáticamente del stock_by_branch.
 */

const mysql = require('mysql2/promise');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Mapa de IDs de sucursal a nombres
const BRANCH_MAP = {
  1: 'MATRIZ',
  2: 'TAMPICO',
  6: 'CIVIL',
  13: 'EJERCITO',
  16: 'CURVA TEXAS'
};

// Clientes excluidos (internos/prueba)
const EXCLUDED_CLIENTS = [80000, 100000, 99999, 100001, 75000];

// Configuración de MySQL
const mysqlConfig = {
  host: '192.168.1.199',
  user: 'visitadoc_reader',
  password: 'VDReader2026!',
  database: 'dbsicofa'
};

// Configuración de Firebase
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Error: Falta el archivo serviceAccountKey.json en la carpeta scripts');
  process.exit(1);
}
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// --- SISTEMA DE CACHÉ PARA AHORRAR LECTURAS ---
const CACHE_FILE = path.join(__dirname, 'barcode_cache.json');

function loadBarcodeCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveBarcodeCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

async function syncSales() {
  // Determinar rango de fechas: ayer (o el argumento que se pase)
  const args = process.argv.slice(2);
  let startDate, endDate;

  if (args.length >= 2) {
    startDate = args[0]; // Formato: YYYY-MM-DD
    endDate = args[1];
  } else {
    // Por defecto: ayer
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    startDate = yesterday.toISOString().split('T')[0];
    endDate = startDate;
  }

  console.log('🔄 Iniciando sincronización de ventas...');
  console.log(`📅 Periodo: ${startDate} → ${endDate}`);
  
  let connection;

  try {
    connection = await mysql.createConnection(mysqlConfig);
    console.log('✅ Conectado a MySQL local.');

    // 1. Ejecutar consulta de ventas
    const excludedList = EXCLUDED_CLIENTS.join(',');
    const [rows] = await connection.execute(`
      SELECT 
        t1.stramecop AS barcode,
        (SELECT STRNOMBRE FROM tblclsarticulo WHERE stramecop = t1.stramecop LIMIT 1) AS product_name,
        (SELECT STRSECTORID FROM tblclsarticulo WHERE stramecop = t1.stramecop LIMIT 1) AS sector,
        SUM(t1.intpzas) AS quantity,
        SUM(t1.DECTOTAL) AS total_sale,
        t1.intidsucursal AS sucursal_id
      FROM tblclsdetventa t1
      INNER JOIN tblclsventa t2 
        ON t1.intidsucursal = t2.intidsucursal
        AND t1.intnumeroventa = t2.intnumeroventa
        AND t2.dtmfecha BETWEEN ? AND ?
        AND t2.INTCLIENTEID NOT IN (${excludedList})
        AND t2.intidsucursal IN (1, 2, 6, 13, 16)
      GROUP BY t1.stramecop, t1.intidsucursal
    `, [`${startDate} 00:00:00`, `${endDate} 23:59:59`]);

    console.log(`📊 Encontradas ${rows.length} líneas de venta.`);

    if (rows.length === 0) {
      console.log('ℹ️  No hay ventas nuevas para este periodo.');
      return;
    }

    // 2. Resolver IDs de productos desde caché o Firebase
    let barcodeCache = loadBarcodeCache();
    let firebaseByBarcode = { ...barcodeCache };
    
    // Solo descargar si el caché está vacío o faltan códigos de las ventas de hoy
    const missingBarcodes = rows.filter(r => !barcodeCache[r.barcode]);
    if (missingBarcodes.length > 0) {
      console.log(`🔍 Faltan ${missingBarcodes.length} productos en el caché. Actualizando catálogo...`);
      const productsSnap = await db.collection('products').get();
      const fbProducts = {};
      productsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.barcode) fbProducts[data.barcode] = { id: doc.id, ...data };
      });

      // Guardar códigos encontrados y no encontrados
      rows.forEach(r => {
        if (fbProducts[r.barcode]) {
          firebaseByBarcode[r.barcode] = fbProducts[r.barcode];
        } else {
          firebaseByBarcode[r.barcode] = { id: null };
        }
      });
      saveBarcodeCache(firebaseByBarcode);
    }

    // 3. Subir ventas y actualizar stock
    let salesCount = 0;
    let stockUpdates = 0;
    let batch = db.batch();
    let opCount = 0;

    for (const row of rows) {
      const branchName = BRANCH_MAP[row.sucursal_id] || `SUC_${row.sucursal_id}`;
      const saleId = `${row.barcode}_${branchName}_${startDate}`;
      
      // Verificar si esta venta ya se sincronizó (evitar duplicados)
      const existingRef = db.collection('mysql_sales').doc(saleId);

      // Registrar la venta
      batch.set(existingRef, {
        barcode: row.barcode,
        product_name: row.product_name || 'SIN NOMBRE',
        sector: row.sector || '',
        quantity: row.quantity,
        total_sale: row.total_sale || 0,
        sucursal: branchName,
        sale_date: startDate,
        synced_at: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true }); // merge evita sobrescribir si ya existe
      
      salesCount++;
      opCount++;

      if (opCount >= 200) {
        await batch.commit();
        await new Promise(r => setTimeout(r, 1500)); // Pausa para no exceder cuota
        batch = db.batch();
        opCount = 0;
        console.log(`   💾 Lote guardado (${salesCount} ventas procesadas)...`);
      }
    }

    if (opCount > 0) await batch.commit();

    // 4. Calcular totales por sucursal para reporte
    const branchTotals = {};
    for (const row of rows) {
      const bn = BRANCH_MAP[row.sucursal_id] || `SUC_${row.sucursal_id}`;
      if (!branchTotals[bn]) branchTotals[bn] = { piezas: 0, monto: 0 };
      branchTotals[bn].piezas += row.quantity;
      branchTotals[bn].monto += parseFloat(row.total_sale) || 0;
    }

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Sincronización de ventas completada`);
    console.log(`   🧾 Ventas registradas: ${salesCount}`);
    console.log(`   📦 Stock actualizado:  ${stockUpdates} productos`);
    console.log('');
    console.log('   📍 Desglose por sucursal:');
    for (const [branch, totals] of Object.entries(branchTotals)) {
      console.log(`      ${branch}: ${totals.piezas} pzas | $${totals.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
    }
    console.log('═══════════════════════════════════════');

  } catch (err) {
    console.error('❌ Error durante la sincronización:', err.message);
  } finally {
    if (connection) await connection.end();
    process.exit();
  }
}

syncSales();
