require('dotenv').config();
const { Client } = require('pg');

async function audit() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    // Buscar duplicados por nombre normalizado
    const res = await client.query(`
      SELECT LOWER(TRIM(name)) as normalized_name, COUNT(*), STRING_AGG(id::text, ', ') as ids
      FROM products
      GROUP BY LOWER(TRIM(name))
      HAVING COUNT(*) > 1
    `);

    console.log('--- PRODUCTOS DUPLICADOS DETECTADOS ---');
    if (res.rows.length === 0) {
      console.log('No se encontraron duplicados exactos.');
    } else {
      console.table(res.rows);
    }

    // Verificar códigos de barras duplicados
    const barcodes = await client.query(`
      SELECT barcode, COUNT(*), STRING_AGG(name, ' | ') as products
      FROM products
      WHERE barcode <> '' AND barcode IS NOT NULL
      GROUP BY barcode
      HAVING COUNT(*) > 1
    `);

    console.log('\n--- CÓDIGOS DE BARRAS DUPLICADOS ---');
    if (barcodes.rows.length === 0) {
      console.log('No hay códigos de barras duplicados.');
    } else {
      console.table(barcodes.rows);
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

audit();
