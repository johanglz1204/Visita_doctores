const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

async function initializeDatabase() {
  const sqlFile = path.join(__dirname, '..', 'db', 'init.sql');
  if (!fs.existsSync(sqlFile)) {
    console.error('Initial SQL file not found at:', sqlFile);
    return;
  }

  const sql = fs.readFileSync(sqlFile, 'utf8');
  
  console.log('Starting automated database initialization...');
  try {
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await db.query(stmt);
    }
    console.log('✅ Database schema verified/created successfully.');
    
    // Also run migrations if any
    try {
        const { runMigrations } = require('./migrate'); 
        await runMigrations();
    } catch (migErr) {
        console.warn('⚠️ Could not run migrations:', migErr.message);
    }
  } catch (err) {
    // This may fail on restart because indexes already exist — that's OK
    console.warn('⚠️ Schema init warning (non-fatal):', err.message);
  }

  // Always restore seed data regardless of schema result
  await restoreSeedData();

  // Always ensure the admin user exists with the correct password
  await ensureAdminUser();

  // Ensure settings table exists
  await ensureSettingsTable();
  
  // Ensure MySQL sync log table exists
  await ensureMySQLSyncLogsTable();
}

async function ensureSettingsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default sync interval if not exists
    await db.query(`
      INSERT INTO settings (key, value)
      VALUES ('sync_interval_minutes', '60')
      ON CONFLICT (key) DO NOTHING
    `);

    console.log('✅ Tabla settings verificada/creada.');
  } catch (err) {
    console.warn('⚠️ No se pudo crear tabla settings:', err.message);
  }
}

async function ensureAdminUser() {
  try {
    // Ensure users table exists (in case init.sql failed partially)
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        username   TEXT UNIQUE NOT NULL,
        password   TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Generate a fresh bcrypt hash for "admin"
    const hashedPassword = await bcrypt.hash('admin', 10);

    // Upsert: create admin if not exists, otherwise do nothing
    const result = await db.query(
      `INSERT INTO users (username, password)
       VALUES ($1, $2)
       ON CONFLICT (username) DO NOTHING`,
      ['admin', hashedPassword]
    );

    console.log('✅ Admin user verified.');
  } catch (err) {
    console.error('❌ Error ensuring admin user:', err.message);
  }
}

async function restoreSeedData() {
  try {
    const seedFile = path.join(__dirname, '..', 'db', 'seed_data.sql');
    if (!fs.existsSync(seedFile)) {
      console.log('ℹ️  No seed_data.sql found. Skipping data restore.');
      return;
    }

    // Check current counts to see if seeding is needed
    const { rows: docRows } = await db.query('SELECT COUNT(*) as count FROM doctors');
    const { rows: prodRows } = await db.query('SELECT COUNT(*) as count FROM products');
    const doctorCount = parseInt(docRows[0].count);
    const productCount = parseInt(prodRows[0].count);

    // If we already have a significant number of records, skip seeding
    // This prevents deleted products from reappearing on server restart
    if (doctorCount > 5 || productCount > 20) {
      console.log(`ℹ️  Skipping seed restore: DB already has ${doctorCount} doctors and ${productCount} products.`);
      return;
    }

    const seedSql = fs.readFileSync(seedFile, 'utf8');
    const statements = seedSql.split('\n').filter(l => {
      const t = l.trim();
      return (t.startsWith('INSERT') || t.startsWith('SELECT setval')) && !t.includes('PBXMo9pauS');
    });

    console.log(`🌱 Running seed restore (DB is empty, seed has ${statements.length} statements)...`);
    let success = 0, errors = 0;
    for (const stmt of statements) {
      try {
        await db.query(stmt.trim());
        success++;
      } catch (e) {
        errors++;
      }
    }

    console.log(`✅ Seed complete: ${success} OK, ${errors} skipped.`);
  } catch (err) {
    console.error('❌ Error restoring seed data:', err.message);
  }
}

async function ensureMySQLSyncLogsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS mysql_sync_logs (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        synced_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_mysql    INTEGER DEFAULT 0,
        matched        INTEGER DEFAULT 0,
        updated        INTEGER DEFAULT 0,
        unmatched      INTEGER DEFAULT 0,
        errors         INTEGER DEFAULT 0,
        duration_ms    INTEGER DEFAULT 0,
        unmatched_list TEXT DEFAULT '[]',
        matched_list   TEXT DEFAULT '[]'
      );
    `);
    console.log('✅ Tabla mysql_sync_logs verificada/creada.');
  } catch (err) {
    console.warn('⚠️ No se pudo crear mysql_sync_logs:', err.message);
  }
}

module.exports = { initializeDatabase, ensureAdminUser, restoreSeedData, ensureMySQLSyncLogsTable };

// If run directly via node initialize_db.js
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  initializeDatabase().then(() => process.exit(0)).catch(() => process.exit(1));
}
