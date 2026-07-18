require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const db = require('../server/db');

const EXCLUDED_CLIENTS = [1, 5, 23, 24, 60, 61];

const mysqlConfig = {
  host: process.env.MYSQL_HOST || '25.45.167.83',
  port: parseInt(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'visitadoc_reader',
  password: process.env.MYSQL_PASSWORD || 'VDReader2026!',
  database: process.env.MYSQL_DATABASE || 'dbsicofa',
  connectTimeout: 10000
};

// Mapa de IDs de sucursal a nombres
const BRANCH_MAP = {
  1: 'MATRIZ',
  2: 'TAMPICO',
  6: 'CIVIL',
  13: 'EJERCITO',
  16: 'CURVA TEXAS'
};

async function syncSalesToSQLite(days = 90) {
  console.log(`🔄 Iniciando importación de ventas de los últimos ${days} días desde MySQL a SQLite...`);
  let connection;

  try {
    connection = await mysql.createConnection(mysqlConfig);
    console.log('✅ Conectado a MySQL Tampico.');

    // Rango de fechas
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    
    const startStr = startDate.toISOString().split('T')[0] + ' 00:00:00';
    const endStr = endDate.toISOString().split('T')[0] + ' 23:59:59';

    console.log(`📅 Periodo: ${startStr} → ${endStr}`);

    const excludedList = EXCLUDED_CLIENTS.join(',');
    
    // Consulta agrupada por producto, sucursal y DÍA
    // Esto es crucial para que las gráficas de líneas de tiempo en el dashboard funcionen
    const [rows] = await connection.execute(`
      SELECT 
        t1.stramecop AS barcode,
        DATE(t2.dtmfecha) AS sale_date,
        SUM(t1.intpzas) AS quantity,
        t1.intidsucursal AS sucursal_id
      FROM tblclsdetventa t1
      INNER JOIN tblclsventa t2 
        ON t1.intidsucursal = t2.intidsucursal
        AND t1.intnumeroventa = t2.intnumeroventa
        AND t2.dtmfecha BETWEEN ? AND ?
        AND t2.INTCLIENTEID NOT IN (${excludedList})
        AND t2.intidsucursal IN (1, 2, 6, 13, 16)
      GROUP BY t1.stramecop, DATE(t2.dtmfecha), t1.intidsucursal
    `, [startStr, endStr]);

    console.log(`📊 Descargadas ${rows.length} agrupaciones de venta por día/sucursal.`);

    if (rows.length === 0) {
      console.log('ℹ️  No hay ventas en MySQL para este periodo.');
      return;
    }

    // Obtener catálogo de productos local
    const { rows: products } = await db.query('SELECT id, barcode FROM products WHERE barcode IS NOT NULL AND barcode != ""');
    const productMap = new Map();
    for (const p of products) {
      if (p.barcode) {
        // Limpiamos los códigos por si hay ceros iniciales
        let code = p.barcode.toString().trim();
        if (code.length > 5) code = code.replace(/^0+/, '');
        productMap.set(code, p.id);
        productMap.set(p.barcode.toString().trim(), p.id); // Guardamos la versión original también
      }
    }

    // El doctor genérico para estas ventas agrupadas será "Venta General MySQL"
    let genericDoctorId = null;
    const { rows: docRows } = await db.query("SELECT id FROM doctors WHERE name = 'Venta General MySQL' LIMIT 1");
    if (docRows.length > 0) {
      genericDoctorId = docRows[0].id;
    } else {
      const { rows: newDoc } = await db.query("INSERT INTO doctors (name) VALUES ('Venta General MySQL') RETURNING id");
      genericDoctorId = newDoc[0].id;
    }

    // Insertar las ventas en SQLite
    let inserted = 0;
    let notFoundProducts = 0;

    // Usar una transacción para insertar rápido
    const knex = db.knex;
    
    // Primero, vamos a borrar las ventas de este doctor genérico en este periodo para no duplicar si se corre dos veces
    await knex('sales_history')
      .where('doctor_id', genericDoctorId)
      .where('sale_date', '>=', startDate.toISOString().split('T')[0])
      .del();

    console.log('🧹 Limpieza de ventas previas del mismo periodo realizada.');

    const batchInsert = [];

    for (const row of rows) {
      if (!row.barcode || !row.quantity) continue;
      
      let code = row.barcode.toString().trim();
      if (code.length > 5) code = code.replace(/^0+/, '');
      
      const productId = productMap.get(code) || productMap.get(row.barcode.toString().trim());
      
      if (!productId) {
        notFoundProducts++;
        continue; // Producto no existe en SQLite local, lo omitimos
      }

      const branchName = BRANCH_MAP[row.sucursal_id] || 'MATRIZ';

      batchInsert.push({
        doctor_id: genericDoctorId,
        product_id: productId,
        quantity: row.quantity,
        sale_date: row.sale_date,
        sucursal: branchName,
        raw_text: 'Sincronizado desde MySQL',
      });
    }

    // Insertar en chunks de 500 para no saturar SQLite
    const chunkSize = 500;
    for (let i = 0; i < batchInsert.length; i += chunkSize) {
      const chunk = batchInsert.slice(i, i + chunkSize);
      await knex('sales_history').insert(chunk);
      inserted += chunk.length;
    }

    console.log(`✅ Sincronización completada: ${inserted} ventas importadas. (${notFoundProducts} omitidas por producto no encontrado)`);

  } catch (err) {
    console.error('❌ Error sincronizando ventas:', err.message);
  } finally {
    if (connection) await connection.end();
    process.exit(0);
  }
}

syncSalesToSQLite();
