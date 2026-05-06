const mysql = require('mysql2/promise');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Configuración de MySQL
const mysqlConfig = {
  host: '192.168.1.199',
  user: 'visitadoc_reader',
  password: 'VDReader2026!',
  database: 'dbsicofa'
};

// Firebase
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  console.log('🧠 Iniciando recalculo de Rankings basado en ventas de 3 meses...');
  let connection;

  try {
    connection = await mysql.createConnection(mysqlConfig);
    console.log('✅ Conectado a MySQL.');

    // 1. Definir periodos (Buckets de 30 días)
    // Mes 1: Hoy - 30 días
    // Mes 2: -31 a -60 días
    // Mes 3: -61 a -90 días
    
    console.log('📊 Analizando historia de ventas por sucursal (180 días)...');
    const [salesRows] = await connection.execute(`
      SELECT 
        t1.stramecop AS barcode,
        t2.intidsucursal as branch_id,
        CASE 
          WHEN t2.intidsucursal = 1 THEN 'MATRIZ'
          WHEN t2.intidsucursal = 2 THEN 'TAMPICO'
          WHEN t2.intidsucursal = 6 THEN 'CIVIL'
          WHEN t2.intidsucursal = 13 THEN 'EJERCITO'
          WHEN t2.intidsucursal = 16 THEN 'CURVA TEXAS'
          ELSE 'OTRA'
        END as branch_name,
        SUM(CASE WHEN t2.dtmfecha >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN t1.intpzas ELSE 0 END) as m1_qty,
        SUM(CASE WHEN t2.dtmfecha >= DATE_SUB(NOW(), INTERVAL 60 DAY) AND t2.dtmfecha < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN t1.intpzas ELSE 0 END) as m2_qty,
        SUM(CASE WHEN t2.dtmfecha >= DATE_SUB(NOW(), INTERVAL 90 DAY) AND t2.dtmfecha < DATE_SUB(NOW(), INTERVAL 60 DAY) THEN t1.intpzas ELSE 0 END) as m3_qty,
        SUM(CASE WHEN t2.dtmfecha >= DATE_SUB(NOW(), INTERVAL 120 DAY) AND t2.dtmfecha < DATE_SUB(NOW(), INTERVAL 90 DAY) THEN t1.intpzas ELSE 0 END) as m4_qty,
        SUM(CASE WHEN t2.dtmfecha >= DATE_SUB(NOW(), INTERVAL 150 DAY) AND t2.dtmfecha < DATE_SUB(NOW(), INTERVAL 120 DAY) THEN t1.intpzas ELSE 0 END) as m5_qty,
        SUM(CASE WHEN t2.dtmfecha >= DATE_SUB(NOW(), INTERVAL 180 DAY) AND t2.dtmfecha < DATE_SUB(NOW(), INTERVAL 150 DAY) THEN t1.intpzas ELSE 0 END) as m6_qty,
        SUM(CASE WHEN t2.dtmfecha >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN t1.intpzas ELSE 0 END) as total_90d,
        SUM(CASE WHEN t2.dtmfecha >= DATE_SUB(NOW(), INTERVAL 180 DAY) AND t2.dtmfecha < DATE_SUB(NOW(), INTERVAL 90 DAY) THEN t1.intpzas ELSE 0 END) as prev_90d
      FROM tblclsdetventa t1
      INNER JOIN tblclsventa t2 ON t1.intidsucursal = t2.intidsucursal AND t1.intnumeroventa = t2.intnumeroventa
      WHERE t2.dtmfecha >= DATE_SUB(NOW(), INTERVAL 180 DAY)
        AND t2.INTCLIENTEID NOT IN (80000, 100000, 99999, 100001, 75000)
        AND t2.intidsucursal IN (1, 2, 6, 13, 16)
      GROUP BY t1.stramecop, t2.intidsucursal
    `);

    const salesMap = new Map();
    salesRows.forEach(r => {
      const barcode = String(r.barcode);
      if (!salesMap.has(barcode)) {
        salesMap.set(barcode, { m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, total_90d: 0, prev_90d: 0, by_branch: {} });
      }
      const data = salesMap.get(barcode);
      data.m1 += parseInt(r.m1_qty || 0);
      data.m2 += parseInt(r.m2_qty || 0);
      data.m3 += parseInt(r.m3_qty || 0);
      data.m4 += parseInt(r.m4_qty || 0);
      data.m5 += parseInt(r.m5_qty || 0);
      data.m6 += parseInt(r.m6_qty || 0);
      data.total_90d += parseInt(r.total_90d || 0);
      data.prev_90d += parseInt(r.prev_90d || 0);
      
      const b_total = parseInt(r.total_90d || 0);
      const b_prev = parseInt(r.prev_90d || 0);
      
      let trend = 'stable';
      if (b_prev > 0 && b_total < b_prev) trend = 'declining';
      else if (b_total > b_prev) trend = 'growing';

      data.by_branch[r.branch_name] = {
        total_90d: b_total,
        prev_90d: b_prev,
        daily_rate: parseFloat((b_total / 90).toFixed(4)),
        trend: trend
      };
    });


    console.log(`✅ Ventas procesadas para ${salesMap.size} productos.`);

    // 2. Obtener catálogo actual de Firebase
    console.log('📡 Consultando productos en Firebase...');
    const snap = await db.collection('products').get();
    const products = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 3. Aplicar reglas y preparar lote
    let batch = db.batch();
    let opCount = 0;
    let stats = { AA: 0, A: 0, B: 0, C: 0, E: 0, Z: 0 };

    for (const p of products) {
      if (!p.barcode) continue;
      
      const s = salesMap.get(String(p.barcode)) || { m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0 };
      const stock = p.stock || 0;
      
      let newRanking = 'Z';
      const monthsWithSales = (s.m1 > 0 ? 1 : 0) + (s.m2 > 0 ? 1 : 0) + (s.m3 > 0 ? 1 : 0);

      if (s.m1 > 10 && s.m2 > 10 && s.m3 > 10) {
        newRanking = 'AA';
      } else if (s.m1 >= 1 && s.m2 >= 1 && s.m3 >= 1) {
        newRanking = 'A';
      } else if (monthsWithSales === 2) {
        newRanking = 'B';
      } else if (monthsWithSales === 1) {
        newRanking = 'C';
      } else {
        newRanking = stock > 0 ? 'E' : 'Z';
      }

      let prevRanking = 'Z';
      const prevMonthsWithSales = (s.m4 > 0 ? 1 : 0) + (s.m5 > 0 ? 1 : 0) + (s.m6 > 0 ? 1 : 0);

      if (s.m4 > 10 && s.m5 > 10 && s.m6 > 10) {
        prevRanking = 'AA';
      } else if (s.m4 >= 1 && s.m5 >= 1 && s.m6 >= 1) {
        prevRanking = 'A';
      } else if (prevMonthsWithSales === 2) {
        prevRanking = 'B';
      } else if (prevMonthsWithSales === 1) {
        prevRanking = 'C';
      } else {
        prevRanking = stock > 0 ? 'E' : 'Z';
      }

      batch.update(db.collection('products').doc(p.id), { 
        ranking: newRanking,
        prev_ranking: prevRanking,
        sales_metrics: s.by_branch || {},
        ranking_updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      opCount++;

      stats[newRanking]++;

      if (opCount >= 450) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
        console.log('   💾 Guardando lote de rankings...');
      }
    }

    if (opCount > 0) await batch.commit();

    console.log('\n🏁 RECALCULO COMPLETADO');
    console.log('📊 Nuevos rankings asignados:');
    console.log(`   🏆 AA (Superventas): ${stats.AA}`);
    console.log(`   ⭐ A (Constantes):    ${stats.A}`);
    console.log(`   📈 B (Frecuentes):    ${stats.B}`);
    console.log(`   📉 C (Ocasionales):   ${stats.C}`);
    console.log(`   📦 E (Solo Stock):    ${stats.E}`);
    console.log(`   ⚪ Z (Sin movimiento): ${stats.Z}`);
    console.log('═══════════════════════════════════════');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    if (connection) await connection.end();
    process.exit();
  }
}

run();
