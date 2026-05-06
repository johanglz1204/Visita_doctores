/**
 * ============================================================
 * SINCRO-STOCK MULTISUCURSAL: MySQL Local → Firebase Firestore
 * ============================================================
 * Agrupa stock por sucursal y lo sube como mapa stock_by_branch
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

async function syncInventory() {
  console.log('🔄 Iniciando sincronización de inventario multisucursal...');
  console.log(`📍 Sucursales: ${Object.values(BRANCH_MAP).join(', ')}`);
  let connection;

  try {
    connection = await mysql.createConnection(mysqlConfig);
    console.log('✅ Conectado a MySQL local.');

    // 1. Traer stock de las 5 sucursales
    const [rows] = await connection.execute(`
      SELECT 
        stramecop AS barcode, 
        STRNOMBRE AS name, 
        INTEXISTENCIA AS stock, 
        STRRANKING AS ranking,
        STRSECTORID AS sector,
        INTMINIMO AS min_stock,
        INTIDSUCURSAL AS sucursal_id
      FROM tblclsarticulo t1 
      WHERE INTIDSUCURSAL IN (1, 2, 6, 13, 16)
    `);

    console.log(`📦 Encontrados ${rows.length} registros de stock en MySQL.`);

    // 2. Agrupar por barcode → construir stock_by_branch
    const productIndex = {};
    for (const row of rows) {
      const branchName = BRANCH_MAP[row.sucursal_id] || `SUC_${row.sucursal_id}`;
      
      if (!productIndex[row.barcode]) {
        productIndex[row.barcode] = {
          name: row.name,
          ranking: row.ranking || '',
          sector: row.sector || '',
          min_stock: row.min_stock || 0,
          stock_by_branch: {}
        };
      }
      
      productIndex[row.barcode].stock_by_branch[branchName] = row.stock || 0;
    }

    const uniqueProducts = Object.keys(productIndex);
    console.log(`🧮 Productos únicos agrupados: ${uniqueProducts.length}`);

    // 3. Obtener mapeo de Barcode -> Firebase ID desde caché o Firebase
    let barcodeCache = loadBarcodeCache();
    let firebaseByBarcode = { ...barcodeCache };
    let needsFullFetch = Object.keys(barcodeCache).length === 0;

    // Verificar si hay códigos nuevos en MySQL que no están en el caché
    const missingBarcodes = uniqueProducts.filter(b => !barcodeCache[b]);
    
    if (missingBarcodes.length > 0) {
      console.log(`🔍 Detectados ${missingBarcodes.length} productos nuevos o no cacheeados. Sincronizando catálogo...`);
      needsFullFetch = true;
    }

    if (needsFullFetch) {
      console.log('📡 Descargando catálogo completo de productos para actualizar caché...');
      const productsSnap = await db.collection('products').get();
      const fbProducts = {};
      productsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.barcode) {
          fbProducts[data.barcode] = { 
            id: doc.id, 
            ranking: data.ranking, 
            sector: data.sector,
            min_stock: data.min_stock,
            stock: data.stock, 
            stock_by_branch: data.stock_by_branch 
          };
        }
      });

      // Guardar caché: códigos encontrados + códigos no encontrados (id: null)
      uniqueProducts.forEach(barcode => {
        if (fbProducts[barcode]) {
          firebaseByBarcode[barcode] = fbProducts[barcode];
        } else {
          firebaseByBarcode[barcode] = { id: null };
        }
      });

      saveBarcodeCache(firebaseByBarcode);
    }

    // 4. Actualizar productos existentes (solo si hay cambios)
    let updatedCount = 0;
    let skippedCount = 0;
    let batch = db.batch();
    let opCount = 0;

    for (const barcode of uniqueProducts) {
      const prod = productIndex[barcode];
      const fbProd = firebaseByBarcode[barcode];

      if (fbProd && fbProd.id) {
        const totalStock = Object.values(prod.stock_by_branch).reduce((a, b) => a + b, 0);

        // Comparar datos para ver si amerita actualización
        const hasChanges = 
          fbProd.ranking !== prod.ranking ||
          fbProd.sector !== prod.sector ||
          fbProd.min_stock !== prod.min_stock ||
          fbProd.stock !== totalStock ||
          JSON.stringify(fbProd.stock_by_branch) !== JSON.stringify(prod.stock_by_branch);

        if (hasChanges) {
          const ref = db.collection('products').doc(fbProd.id);
          batch.update(ref, {
            ranking: prod.ranking || '',
            sector: prod.sector || '',
            min_stock: prod.min_stock || 0,
            stock: totalStock,
            stock_by_branch: prod.stock_by_branch,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          updatedCount++;
          opCount++;
        } else {
          skippedCount++;
        }
      }

      if (opCount >= 400) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
        console.log(`   💾 Lote guardado (${updatedCount} actualizados)...`);
      }
    }

    if (opCount > 0) await batch.commit();

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Sincronización completada`);
    console.log(`   📝 Actualizados: ${updatedCount}`);
    console.log(`   ⏭️  Omitidos (sin cambios): ${skippedCount}`);
    console.log(`   📦 Total procesados de MySQL: ${uniqueProducts.length}`);
    console.log('═══════════════════════════════════════');

  } catch (err) {
    console.error('❌ Error durante la sincronización:', err.message);
  } finally {
    if (connection) await connection.end();
    process.exit();
  }
}

syncInventory();
