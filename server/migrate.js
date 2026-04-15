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

    return true;
  } catch (err) {
    console.error('Migration failed:', err.message);
    throw err;
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
