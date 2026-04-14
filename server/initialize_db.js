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
    console.log('✅ Database schema and seed data verified/created successfully.');
    
    // Also run migrations if any
    try {
        const { runMigrations } = require('./migrate'); 
        await runMigrations();
    } catch (migErr) {
        console.warn('⚠️ Could not run migrations:', migErr.message);
    }

    // Restore seed data if tables are empty
    await restoreSeedData();

  } catch (err) {
    console.error('❌ Error during automated database initialization:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
  }

  // Always ensure the admin user exists with the correct password
  await ensureAdminUser();
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
    // Check if doctors table is already populated
    const { rows } = await db.query('SELECT COUNT(*) as count FROM doctors');
    const count = parseInt(rows[0].count);
    
    if (count > 0) {
      console.log(`ℹ️  Data already exists (${count} doctors). Skipping seed restore.`);
      return;
    }

    const seedFile = path.join(__dirname, '..', 'db', 'seed_data.sql');
    if (!fs.existsSync(seedFile)) {
      console.log('ℹ️  No seed_data.sql found. Skipping data restore.');
      return;
    }

    console.log('🌱 Restoring seed data from seed_data.sql...');
    const seedSql = fs.readFileSync(seedFile, 'utf8');
    
    // Execute each INSERT statement individually to handle errors gracefully
    const statements = seedSql.split('\n').filter(l => l.trim().startsWith('INSERT') || l.trim().startsWith('SELECT setval'));
    let success = 0, errors = 0;
    for (const stmt of statements) {
      try {
        await db.query(stmt.trim());
        success++;
      } catch (e) {
        errors++;
      }
    }
    console.log(`✅ Seed data restored: ${success} statements OK, ${errors} skipped.`);
  } catch (err) {
    console.error('❌ Error restoring seed data:', err.message);
  }
}

module.exports = { initializeDatabase, ensureAdminUser, restoreSeedData };

// If run directly via node initialize_db.js
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  initializeDatabase().then(() => process.exit(0)).catch(() => process.exit(1));
}
