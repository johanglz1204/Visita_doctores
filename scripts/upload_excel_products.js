const XLSX = require('xlsx');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Configuración
const EXCEL_FILE = 'productos en sistema.xlsx';
const BATCH_SIZE = 500;
const DELAY_MS = 1000;

// Firebase
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

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? '🔍 MODO SIMULACIÓN (No se harán cambios en Firebase)' : '🚀 MODO EJECUCIÓN (Se aplicarán cambios)');

  // 1. Leer Excel
  const excelPath = path.join(__dirname, '..', EXCEL_FILE);
  if (!fs.existsSync(excelPath)) {
    console.error(`❌ Error: No se encuentra el archivo ${EXCEL_FILE} en el directorio raíz.`);
    process.exit(1);
  }

  console.log(`📖 Leyendo ${EXCEL_FILE}...`);
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelRows = XLSX.utils.sheet_to_json(sheet);

  const excelMap = new Map();
  for (const row of excelRows) {
    const barcode = String(row.Codigo || '').trim();
    const name = String(row.Descripcion || '').trim();
    if (barcode && barcode !== 'Codigo') { // Ignorar cabecera si se coló
      excelMap.set(barcode, name);
    }
  }
  console.log(`✅ Excel procesado: ${excelMap.size} productos únicos encontrados.`);

  // 2. Obtener productos de Firebase
  console.log('📡 Consultando Firebase (esto puede tardar un momento)...');
  const snap = await db.collection('products').get();
  const firebaseProducts = snap.docs.map(doc => ({
    id: doc.id,
    barcode: doc.data().barcode,
    name: doc.data().name
  }));
  console.log(`✅ Firebase tiene ${firebaseProducts.length} productos actualmente.`);

  // 3. Identificar cambios
  const toDelete = firebaseProducts.filter(p => p.barcode && !excelMap.has(p.barcode));
  const toUpsert = [];
  
  const firebaseBarcodeMap = new Map(firebaseProducts.map(p => [p.barcode, p]));
  
  for (const [barcode, name] of excelMap.entries()) {
    const existing = firebaseBarcodeMap.get(barcode);
    if (!existing || existing.name !== name) {
      toUpsert.push({ barcode, name, id: existing?.id });
    }
  }

  console.log('\n📊 Resumen de cambios:');
  console.log(`   ➖ Para eliminar: ${toDelete.length}`);
  console.log(`   ➕ Para crear/actualizar: ${toUpsert.length}`);
  console.log(`   🧱 Sin cambios: ${excelMap.size - toUpsert.length}`);
  
  const totalOps = toDelete.length + toUpsert.length;
  console.log(`   ⚠️ Total operaciones estimadas: ${totalOps}`);

  if (dryRun) {
    console.log('\nFin de la simulación.');
    process.exit();
  }

  if (totalOps > 20000) {
    console.error('❌ ERROR: Las operaciones exceden la cuota diaria (20,000).');
    console.error('   Sugerencia: Divida el Excel en dos partes o espere al reinicio de la cuota.');
    process.exit(1);
  }

  // 4. Ejecutar operaciones en lotes
  let opsDone = 0;

  // Deletions first
  if (toDelete.length > 0) {
    console.log('\n🗑️ Eliminando productos obsoletos...');
    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = toDelete.slice(i, i + BATCH_SIZE);
      chunk.forEach(p => batch.delete(db.collection('products').doc(p.id)));
      await batch.commit();
      opsDone += chunk.length;
      console.log(`   ✅ Borrados: ${opsDone}/${toDelete.length}`);
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // Upserts
  if (toUpsert.length > 0) {
    console.log('\n📝 Cargando/Actualizando productos del Excel...');
    let upsertDone = 0;
    for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = toUpsert.slice(i, i + BATCH_SIZE);
      chunk.forEach(p => {
        const ref = p.id ? db.collection('products').doc(p.id) : db.collection('products').doc();
        batch.set(ref, {
          barcode: p.barcode,
          name: p.name,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
      await batch.commit();
      upsertDone += chunk.length;
      console.log(`   ✅ Cargados/Actualizados: ${upsertDone}/${toUpsert.length}`);
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log('\n🏁 PROCESO COMPLETADO CON ÉXITO.');
  process.exit();
}

run().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
