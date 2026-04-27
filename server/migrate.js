const db = require('./db');

async function runMigrations() {
  const migrations = [
    { name: 'Add license to doctors', query: 'ALTER TABLE doctors ADD COLUMN IF NOT EXISTS license VARCHAR(100);' },
    { name: 'Add sucursal to sales_history', query: "ALTER TABLE sales_history ADD COLUMN IF NOT EXISTS sucursal VARCHAR(100) DEFAULT '';" },
    { name: 'Add stock to products', query: "ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;" },
    { name: 'Add min_stock to products', query: "ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0;" },
    { name: 'Add target_stock to products', query: "ALTER TABLE products ADD COLUMN IF NOT EXISTS target_stock INTEGER DEFAULT 0;" },
    { 
      name: 'Create stock_out_history table', 
      query: `
        CREATE TABLE IF NOT EXISTS stock_out_history (
          id                SERIAL PRIMARY KEY,
          product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          start_date        TIMESTAMPTZ DEFAULT NOW(),
          end_date          TIMESTAMPTZ,
          last_stock_value  INTEGER DEFAULT 0,
          estimated_loss    NUMERIC(10, 2) DEFAULT 0
        );
      `
    },
    {
      name: 'Create unique index on products.name',
      query: `CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_unique ON products (LOWER(TRIM(name)))`
    },
    {
      name: 'Create product_aliases table',
      query: `
        CREATE TABLE IF NOT EXISTS product_aliases (
          id              SERIAL PRIMARY KEY,
          alias_name      VARCHAR(255) NOT NULL,
          product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          created_at      TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(LOWER(alias_name))
        );
      `
    },
    {
      name: 'Create doctor_visits table',
      query: `
        CREATE TABLE IF NOT EXISTS doctor_visits (
          id              SERIAL PRIMARY KEY,
          doctor_id       INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
          visit_date      TIMESTAMPTZ DEFAULT NOW(),
          samples_left    TEXT DEFAULT '',
          notes           TEXT DEFAULT '',
          created_at      TIMESTAMPTZ DEFAULT NOW()
        );
      `
    },
    {
      name: 'Add category to doctors',
      query: "ALTER TABLE doctors ADD COLUMN IF NOT EXISTS category VARCHAR(10) DEFAULT '';"
    }
  ];

  for (const m of migrations) {
    try {
      await db.query(m.query);
      console.log(`Migration successful: ${m.name}`);
    } catch (err) {
      console.warn(`Migration warning [${m.name}]:`, err.message);
    }
  }

  return true;
}


module.exports = { runMigrations };

// Only run if called directly
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
