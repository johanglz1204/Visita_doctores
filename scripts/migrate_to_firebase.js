/**
 * ============================================================
 * SCRIPT DE MIGRACIÓN: PostgreSQL → Firebase Firestore
 * ============================================================
 * 
 * REQUISITOS ANTES DE EJECUTAR:
 * 1. Descarga la "Llave de cuenta de servicio" de Firebase:
 *    - Ve a Firebase Console → Configuración del proyecto (⚙️)
 *    - Pestaña "Cuentas de servicio"
 *    - Haz clic en "Generar nueva clave privada"
 *    - Guarda el archivo como: serviceAccountKey.json
 *      en la misma carpeta donde está este script (scripts/)
 * 
 * 2. Instala la dependencia del Admin SDK (desde la raíz del proyecto):
 *    cd scripts && npm install firebase-admin
 * 
 * 3. Ejecuta el script:
 *    node migrate_to_firebase.js
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

// Intentar cargar firebase-admin
let admin;
try {
  admin = require('firebase-admin');
} catch (e) {
  console.error('❌ firebase-admin no está instalado.');
  console.error('   Ejecuta: cd scripts && npm install firebase-admin');
  process.exit(1);
}

// Cargar la llave de cuenta de servicio
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ No se encontró serviceAccountKey.json en la carpeta scripts/');
  console.error('   Descárgala desde: Firebase Console → Configuración → Cuentas de servicio');
  process.exit(1);
}

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ============================================================
// PARSEO DEL ARCHIVO SQL
// ============================================================

function parseSQLFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  const doctors = [];
  const products = [];
  const sales = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('INSERT INTO')) continue;

    try {
      // --- Doctores ---
      if (trimmed.startsWith('INSERT INTO doctors')) {
        const match = trimmed.match(/VALUES \((\d+), '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']+)', '([^']+)',/);
        if (match) {
          doctors.push({
            id: parseInt(match[1]),
            name: match[2].replace(/\?\?/g, 'Ñ').replace(/├æ/g, 'Ñ').replace(/├æ/g, 'Ñ').trim(),
            specialty: match[3],
            phone: match[4],
            email: match[5],
            address: match[6],
            notes: match[7],
            createdAt: new Date(match[8]),
          });
        }
      }

      // --- Productos ---
      if (trimmed.startsWith('INSERT INTO products')) {
        const match = trimmed.match(/VALUES \((\d+), '([^']*)', '([^']+)', '([^']+)', ([^,]+), ([^,]+), ([\d.]+)\)/);
        if (match) {
          products.push({
            id: parseInt(match[1]),
            name: match[2].replace(/\u00c2\u00b4/g, ' ').trim(),
            createdAt: new Date(match[3]),
            barcode: match[5] === 'NULL' ? null : match[5].replace(/'/g, ''),
            ranking: match[6] === 'NULL' ? null : match[6].replace(/'/g, ''),
            price: parseFloat(match[7]) || 0,
          });
        }
      }

      // --- Historial de Ventas ---
      if (trimmed.startsWith('INSERT INTO sales_history')) {
        const match = trimmed.match(/VALUES \((\d+), (\d+|NULL), (\d+|NULL), (\d+), '(\d{4}-\d{2}-\d{2})', '([^']*)', '([^']+)', '([^']+)', '([^']*)'\)/);
        if (match) {
          sales.push({
            id: parseInt(match[1]),
            doctor_id: match[2] === 'NULL' ? null : parseInt(match[2]),
            product_id: match[3] === 'NULL' ? null : parseInt(match[3]),
            quantity: parseInt(match[4]),
            sale_date: match[5],
            raw_text: match[6],
            sucursal: match[9] || '',
          });
        }
      }
    } catch (e) {
      // Ignorar líneas que no se pueden parsear
    }
  }

  return { doctors, products, sales };
}

// ============================================================
// SUBIDA A FIRESTORE EN LOTES
// ============================================================

async function uploadInBatches(collectionName, items, mapFn, idField = 'id') {
  console.log(`\n📤 Subiendo ${items.length} registros a colección '${collectionName}'...`);
  
  const BATCH_SIZE = 400; // Firestore permite máximo 500 por lote
  let uploaded = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = items.slice(i, i + BATCH_SIZE);
    
    for (const item of chunk) {
      const data = mapFn(item);
      const docId = String(item[idField]);
      const ref = db.collection(collectionName).doc(docId);
      batch.set(ref, data, { merge: true });
    }

    await batch.commit();
    uploaded += chunk.length;
    process.stdout.write(`\r   ✓ ${uploaded}/${items.length} subidos...`);
  }

  console.log(`\n   ✅ '${collectionName}' completado.`);
}

// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================

async function main() {
  console.log('🚀 Iniciando migración de datos a Firebase Firestore...\n');

  const sqlPath = path.join(__dirname, '..', 'db', 'seed_data.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('❌ No se encontró el archivo db/seed_data.sql');
    process.exit(1);
  }

  console.log('📖 Leyendo y parseando archivo SQL...');
  const { doctors, products, sales } = parseSQLFile(sqlPath);
  
  console.log(`   → Doctores encontrados: ${doctors.length}`);
  console.log(`   → Productos encontrados: ${products.length}`);
  console.log(`   → Ventas encontradas: ${sales.length}`);

  // --- Subir Doctores ---
  await uploadInBatches('doctors', doctors, (d) => ({
    name: d.name,
    specialty: d.specialty || '',
    phone: d.phone || '',
    email: d.email || '',
    address: d.address || '',
    notes: d.notes || '',
    legacyId: d.id,
    createdAt: admin.firestore.Timestamp.fromDate(d.createdAt || new Date()),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }));

  // --- Subir Productos ---
  await uploadInBatches('products', products, (p) => ({
    name: p.name,
    barcode: p.barcode || '',
    ranking: p.ranking || '',
    price: p.price || 0,
    stock: 0,
    min_stock: 0,
    presentation: '',
    laboratory: '',
    description: '',
    legacyId: p.id,
    createdAt: admin.firestore.Timestamp.fromDate(p.createdAt || new Date()),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }));

  // --- Subir Historial de Ventas ---
  await uploadInBatches('sales', sales, (s) => ({
    doctor_id: s.doctor_id ? String(s.doctor_id) : null,
    product_id: s.product_id ? String(s.product_id) : null,
    quantity: s.quantity || 1,
    date: s.sale_date,
    raw_text: s.raw_text || '',
    sucursal: s.sucursal || '',
    legacyId: s.id,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }));

  console.log('\n============================================================');
  console.log('🎉 ¡Migración completada exitosamente!');
  console.log('   Puedes verificar los datos en Firebase Console:');
  console.log('   https://console.firebase.google.com');
  console.log('============================================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Error durante la migración:', err.message);
  process.exit(1);
});
