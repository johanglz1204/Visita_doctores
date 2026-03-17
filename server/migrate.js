require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@localhost:5432/${process.env.POSTGRES_DB}`;
}
const db = require('./db');
async function migrate() {
  try {
    await db.query('ALTER TABLE doctors ADD COLUMN IF NOT EXISTS license VARCHAR(100);');
    console.log('Migration: Added license column to doctors');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}
migrate();
