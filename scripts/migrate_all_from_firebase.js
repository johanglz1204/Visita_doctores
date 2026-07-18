const admin = require('firebase-admin');
const path = require('path');
const dbLocal = require('../server/db');

// Configuración de Firebase
const sa = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(sa)
});
const fb = admin.firestore();

async function migrateAll() {
  console.log('🔄 Iniciando migración TOTAL desde Firebase...');
  const knex = dbLocal.knex;

  try {
    // ==========================================
    // 1. DOCTORS
    // ==========================================
    console.log('⏳ Migrando Doctores...');
    const doctorsSnap = await fb.collection('doctors').get();
    let docsInserted = 0;
    
    // We fetch current doctors to avoid name duplicates
    const { rows: currentDocs } = await dbLocal.query('SELECT name FROM doctors');
    const existingDocNames = new Set(currentDocs.map(d => d.name.toLowerCase().trim()));

    for (const doc of doctorsSnap.docs) {
      const data = doc.data();
      const name = data.name ? data.name.trim() : 'Desconocido';
      
      if (!existingDocNames.has(name.toLowerCase())) {
        await knex('doctors').insert({
          name: name,
          license: data.license || '',
          category: data.category || '',
          created_at: new Date()
        });
        existingDocNames.add(name.toLowerCase());
        docsInserted++;
      }
    }
    console.log(`✅ Doctores importados: ${docsInserted} (Total en Firebase: ${doctorsSnap.size})`);

    // ==========================================
    // 2. PRODUCTS
    // ==========================================
    console.log('⏳ Migrando Productos...');
    const productsSnap = await fb.collection('products').get();
    let prodsInserted = 0;
    let prodsUpdated = 0;

    // Cache local products to handle upserts
    const { rows: currentProds } = await dbLocal.query('SELECT id, name, barcode FROM products');
    const existingProdNames = new Set(currentProds.map(p => p.name.toLowerCase().trim()));
    const existingProdBarcodes = new Set(currentProds.filter(p => p.barcode).map(p => p.barcode.toString().trim()));

    // Necesitamos mapear IDs de Firebase a IDs de SQLite para las ventas
    // El mapa relacionará el document ID de Firebase o el nombre/barcode con el ID de SQLite
    const fbIdToSqliteId = new Map();

    for (const doc of productsSnap.docs) {
      const data = doc.data();
      const name = data.name ? data.name.trim() : 'Desconocido';
      const barcode = data.barcode ? data.barcode.toString().trim() : '';
      
      // Update existing or Insert new
      let sqliteId = null;
      const existingProd = currentProds.find(p => p.name.toLowerCase().trim() === name.toLowerCase() || (barcode && p.barcode === barcode));
      
      if (existingProd) {
        // Update stock numbers if needed
        await knex('products').where('id', existingProd.id).update({
          stock: data.stock || existingProd.stock || 0,
          min_stock: data.min_stock || existingProd.min_stock || 0,
          ranking: data.ranking || existingProd.ranking || ''
        });
        sqliteId = existingProd.id;
        prodsUpdated++;
      } else {
        // Insert new
        const [newIds] = await knex('products').insert({
          name: name,
          barcode: barcode,
          ranking: data.ranking || '',
          price: data.price || 0,
          stock: data.stock || 0,
          min_stock: data.min_stock || 0,
          target_stock: data.target_stock || 0
        }).returning('id');
        sqliteId = newIds.id || newIds;
        prodsInserted++;
      }
      fbIdToSqliteId.set(doc.id, sqliteId);
    }
    console.log(`✅ Productos: ${prodsInserted} insertados, ${prodsUpdated} actualizados (Total FB: ${productsSnap.size})`);

    // Actualizar el cache de SQLite IDs
    const { rows: allDocs } = await dbLocal.query('SELECT id, name FROM doctors');
    const { rows: allProds } = await dbLocal.query('SELECT id, name, barcode FROM products');

    const getDoctorId = (fbNameOrId) => {
      if (!fbNameOrId) return null;
      const str = String(fbNameOrId).toLowerCase().trim();
      const d = allDocs.find(x => x.name.toLowerCase().trim() === str || x.id == str);
      return d ? d.id : null;
    };

    const getProductId = (fbId, fbName) => {
      if (fbIdToSqliteId.has(fbId)) return fbIdToSqliteId.get(fbId);
      if (fbName) {
        const p = allProds.find(x => x.name.toLowerCase().trim() === String(fbName).toLowerCase().trim());
        if (p) return p.id;
      }
      return null;
    };

    // ==========================================
    // 3. SALES
    // ==========================================
    console.log('⏳ Migrando Ventas (Locales)...');
    const salesSnap = await fb.collection('sales').get();
    let salesInserted = 0;

    // Obtener fecha máxima de ventas locales para no duplicar
    const { rows: maxSaleRow } = await dbLocal.query('SELECT MAX(sale_date) as max_date FROM sales_history WHERE sucursal = "MATRIZ" AND raw_text IS NULL');
    const maxSaleDate = maxSaleRow[0].max_date || '2000-01-01';

    for (const doc of salesSnap.docs) {
      const data = doc.data();
      const sDate = data.date || data.sale_date;
      
      // Solo insertar si es más reciente que lo que ya tenemos o si la DB estaba vacía
      if (sDate && sDate >= maxSaleDate) {
        const dId = getDoctorId(data.doctor_id) || getDoctorId(data.doctor_name);
        const pId = getProductId(data.product_id, data.product_name);
        
        if (dId && pId) {
          // Verificar si ya existe para evitar duplicados exactos
          const { rows: existing } = await dbLocal.query('SELECT id FROM sales_history WHERE doctor_id = $1 AND product_id = $2 AND sale_date = $3 AND quantity = $4 LIMIT 1', [dId, pId, sDate, data.quantity || 1]);
          if (existing.length === 0) {
            await knex('sales_history').insert({
              doctor_id: dId,
              product_id: pId,
              quantity: data.quantity || 1,
              sale_date: sDate,
              sucursal: data.sucursal || 'MATRIZ',
              created_at: new Date()
            });
            salesInserted++;
          }
        }
      }
    }
    console.log(`✅ Ventas Locales importadas: ${salesInserted} (Total FB: ${salesSnap.size})`);

    // ==========================================
    // 4. MYSQL SALES
    // ==========================================
    console.log('⏳ Migrando Ventas (MySQL)...');
    const mysqlSalesSnap = await fb.collection('mysql_sales').get();
    let mSalesInserted = 0;

    // Doctor genérico
    let genericDocId = getDoctorId('Venta General MySQL');
    if (!genericDocId) {
      const { rows: newDoc } = await dbLocal.query("INSERT INTO doctors (name) VALUES ('Venta General MySQL') RETURNING id");
      genericDocId = newDoc[0].id;
    }

    const mysqlBatch = [];
    for (const doc of mysqlSalesSnap.docs) {
      const data = doc.data();
      const pId = getProductId(data.product_id, data.product_name) || (data.barcode ? allProds.find(p => p.barcode === data.barcode)?.id : null);
      const sDate = data.date || data.sale_date;

      if (pId && sDate) {
        // Verificar si existe
        const { rows: existing } = await dbLocal.query('SELECT id FROM sales_history WHERE product_id = $1 AND sale_date = $2 AND sucursal = $3 LIMIT 1', [pId, sDate, data.sucursal || 'TAMPICO']);
        if (existing.length === 0) {
          mysqlBatch.push({
            doctor_id: genericDocId,
            product_id: pId,
            quantity: data.quantity || data.total_quantity || 1,
            sale_date: sDate,
            sucursal: data.sucursal || 'TAMPICO',
            raw_text: 'Sincronizado desde Firebase (Histórico MySQL)'
          });
        }
      }
    }
    
    // Insertar en chunks
    for (let i = 0; i < mysqlBatch.length; i += 500) {
      const chunk = mysqlBatch.slice(i, i + 500);
      await knex('sales_history').insert(chunk);
      mSalesInserted += chunk.length;
    }

    console.log(`✅ Ventas MySQL importadas: ${mSalesInserted} (Total FB: ${mysqlSalesSnap.size})`);
    
    console.log('🎉 Migración completada exitosamente.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error en la migración:', error);
    process.exit(1);
  }
}

migrateAll();
