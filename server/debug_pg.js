require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { Client } = require('pg');

async function debugPg() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("\n--- Búsqueda en PostgreSQL ---");
    const { rows: pgRows } = await client.query(`
      SELECT id, name, barcode, ranking
      FROM products
      WHERE barcode IN ('7501314701957', '7501089808943', '7501101600524', '7501165006386')
    `);
    
    console.log(pgRows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

debugPg();
