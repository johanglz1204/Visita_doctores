const db = require('../server/db');

async function migrate() {
  try {
    console.log('Migrating products table...');
    await db.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0
    `);
    console.log('Migration successful: added stock and min_stock to products.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
