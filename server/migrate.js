const db = require('./db');

/**
 * SQLite-compatible migrations.
 * SQLite does NOT support:
 *  - ALTER TABLE ... ADD COLUMN IF NOT EXISTS  (use try/catch instead)
 *  - SERIAL (use INTEGER PRIMARY KEY AUTOINCREMENT)
 *  - TIMESTAMPTZ (use DATETIME)
 *  - NOW() (use CURRENT_TIMESTAMP)
 *  - UNIQUE(LOWER(...)) in CREATE TABLE (create index separately)
 *  - CREATE UNIQUE INDEX IF NOT EXISTS with expressions (expression indexes need SQLite 3.9+)
 */
async function runMigrations() {
  // -----------------------------------------------------------------------
  // Column additions — SQLite doesn't support IF NOT EXISTS for ALTER TABLE.
  // We try each one and silently ignore "duplicate column" errors.
  // -----------------------------------------------------------------------
  const columnMigrations = [
    { name: 'Add license to doctors',            query: "ALTER TABLE doctors ADD COLUMN license TEXT DEFAULT ''" },
    { name: 'Add sucursal to sales_history',     query: "ALTER TABLE sales_history ADD COLUMN sucursal TEXT DEFAULT ''" },
    { name: 'Add stock to products',             query: "ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0" },
    { name: 'Add min_stock to products',         query: "ALTER TABLE products ADD COLUMN min_stock INTEGER DEFAULT 0" },
    { name: 'Add target_stock to products',      query: "ALTER TABLE products ADD COLUMN target_stock INTEGER DEFAULT 0" },
    { name: 'Add category to doctors',           query: "ALTER TABLE doctors ADD COLUMN category TEXT DEFAULT ''" },
    { name: 'Add matched_list to sync_logs',     query: "ALTER TABLE mysql_sync_logs ADD COLUMN matched_list TEXT DEFAULT '[]'" },
    { name: 'Add unmatched_list to sync_logs',   query: "ALTER TABLE mysql_sync_logs ADD COLUMN unmatched_list TEXT DEFAULT '[]'" },
  ];

  for (const m of columnMigrations) {
    try {
      await db.query(m.query);
      console.log(`Migration applied: ${m.name}`);
    } catch (err) {
      // "duplicate column name" is expected on subsequent starts — ignore silently
      if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
        console.warn(`Migration warning [${m.name}]: ${err.message}`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Table creations — SQLite-compatible syntax
  // -----------------------------------------------------------------------
  const tableMigrations = [
    {
      name: 'Create stock_out_history table',
      query: `
        CREATE TABLE IF NOT EXISTS stock_out_history (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          start_date        DATETIME DEFAULT CURRENT_TIMESTAMP,
          end_date          DATETIME,
          last_stock_value  INTEGER DEFAULT 0,
          estimated_loss    REAL DEFAULT 0
        )
      `
    },
    {
      name: 'Create product_aliases table',
      query: `
        CREATE TABLE IF NOT EXISTS product_aliases (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          alias_name      TEXT NOT NULL UNIQUE,
          product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `
    },
    {
      name: 'Create doctor_visits table',
      query: `
        CREATE TABLE IF NOT EXISTS doctor_visits (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          doctor_id       INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
          visit_date      DATETIME DEFAULT CURRENT_TIMESTAMP,
          samples_left    TEXT DEFAULT '',
          notes           TEXT DEFAULT '',
          created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `
    },
  ];

  for (const m of tableMigrations) {
    try {
      await db.query(m.query);
      console.log(`Migration applied: ${m.name}`);
    } catch (err) {
      console.warn(`Migration warning [${m.name}]: ${err.message}`);
    }
  }

  // -----------------------------------------------------------------------
  // Index creations
  // -----------------------------------------------------------------------
  const indexMigrations = [
    { name: 'Index stock_out_history by product_id', query: 'CREATE INDEX IF NOT EXISTS idx_stock_out_product ON stock_out_history(product_id, end_date)' },
    { name: 'Index doctor_visits by doctor_id',      query: 'CREATE INDEX IF NOT EXISTS idx_doctor_visits_doctor_id ON doctor_visits(doctor_id, visit_date)' },
    { name: 'Index product_aliases unique',          query: 'CREATE INDEX IF NOT EXISTS idx_aliases_name ON product_aliases(alias_name)' },
  ];

  for (const m of indexMigrations) {
    try {
      await db.query(m.query);
      console.log(`Migration applied: ${m.name}`);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.warn(`Migration warning [${m.name}]: ${err.message}`);
      }
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
