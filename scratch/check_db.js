require('dotenv').config();
const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const res = await client.query('SELECT id, name, stock, barcode, updated_at FROM products WHERE stock > 0 ORDER BY updated_at DESC LIMIT 10');
    console.log('--- PRODUCTOS CON STOCK ACTUALIZADO ---');
    console.table(res.rows);
    
    const count = await client.query('SELECT count(*) FROM products WHERE stock > 0');
    console.log('Total productos con stock > 0:', count.rows[0].count);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

check();
