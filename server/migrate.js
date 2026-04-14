const db = require('./db');

async function runMigrations() {
  try {
    await db.query('ALTER TABLE doctors ADD COLUMN IF NOT EXISTS license VARCHAR(100);');
    console.log('Migration: Added license column to doctors');
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
