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
    await db.query(sql);
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

  // Ensure MySQL sync log table exists
  await ensureMySQLSyncLogsTable();

  // Migration: Add code column to products if missing
  await migrateProductsTable();
}

async function migrateProductsTable() {
  try {
    console.log('🔄 Checking products table for "code" column...');
    await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS code VARCHAR(255) UNIQUE');
    await db.query('CREATE INDEX IF NOT EXISTS idx_products_code ON products(code)');
    console.log('✅ "code" column verified/added to products.');
  } catch (err) {
    console.warn('⚠️ Product migration warning:', err.message);
  }
}

async function ensureAdminUser() {
  try {
    // Ensure users table exists (in case init.sql failed partially)
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(255) UNIQUE NOT NULL,
        password   VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Generate a fresh bcrypt hash for "admin"
    const hashedPassword = await bcrypt.hash('admin', 10);

    // Upsert: create admin if not exists, otherwise do nothing
    const result = await db.query(
      `INSERT INTO users (username, password)
       VALUES ($1, $2)
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      ['admin', hashedPassword]
    );

    if (result.rows.length > 0) {
      console.log('✅ Admin user created successfully (usuario: admin / contraseña: admin)');
    } else {
      console.log('ℹ️  Admin user already exists.');
    }
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

    // Check current counts
    const { rows } = await db.query('SELECT COUNT(*) as count FROM doctors');
    const doctorCount = parseInt(rows[0].count);

    const seedSql = fs.readFileSync(seedFile, 'utf8');
    const statements = seedSql.split('\n').filter(l => {
      const t = l.trim();
      return t.startsWith('INSERT') || t.startsWith('SELECT setval');
    });

    // Always run seed (ON CONFLICT DO NOTHING makes it safe to re-run)
    console.log(`🌱 Running seed restore (DB has ${doctorCount} doctors, seed has ${statements.length} statements)...`);
    let success = 0, errors = 0;
    for (const stmt of statements) {
      try {
        await db.query(stmt.trim());
        success++;
      } catch (e) {
        errors++;
      }
    }

    const { rows: after } = await db.query('SELECT COUNT(*) as count FROM doctors');
    console.log(`✅ Seed complete: ${success} OK, ${errors} skipped. Doctors in DB: ${after[0].count}`);
  } catch (err) {
    console.error('❌ Error restoring seed data:', err.message);
  }
}

async function ensureMySQLSyncLogsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS mysql_sync_logs (
        id             SERIAL PRIMARY KEY,
        synced_at      TIMESTAMPTZ DEFAULT NOW(),
        total_mysql    INT DEFAULT 0,
        matched        INT DEFAULT 0,
        updated        INT DEFAULT 0,
        unmatched      INT DEFAULT 0,
        errors         INT DEFAULT 0,
        duration_ms    INT DEFAULT 0,
        unmatched_list JSONB DEFAULT '[]'
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
