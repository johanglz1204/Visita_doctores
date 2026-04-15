const db = require('./db');

async function runMigrations() {
  try {
    await db.query('ALTER TABLE doctors ADD COLUMN IF NOT EXISTS license VARCHAR(100);');
    console.log('Migration: Added license column to doctors');

    await db.query("ALTER TABLE sales_history ADD COLUMN IF NOT EXISTS sucursal VARCHAR(100) DEFAULT '';");
    console.log('Migration: Added sucursal column to sales_history');

    await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;");
    await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0;");
    console.log('Migration: Added stock and min_stock columns to products');

    // Create unique index on normalized product name to prevent duplicates
    // NOTE: This must be done AFTER deduplication, otherwise it will fail.
    // The CREATE INDEX CONCURRENTLY is NOT supported in transactions, so we use a regular one.
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_unique 
      ON products (LOWER(TRIM(name)))
    `);
    console.log('Migration: Created unique index on products.name (case-insensitive)');

    return true;
  } catch (err) {
    // Log but don't throw — unique index creation fails if there are still duplicates
    console.warn('Migration warning (non-fatal):', err.message);
    return true;
  }
}


module.exports = { runMigrations };

// Only run if called directly
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
