require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const db = require('../db');

async function run() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('Tabla users creada u omitida si existe.');

    // Default admin user with password 'admin' (bcrypt hashed)
    // Password 'admin' hatches to: $2a$10$B00ZUSq2l8.S9v124H60QezcQ09b.I5p2Lg735P.l.q7bH7X.a1yC
    await db.query(`
      INSERT INTO users (username, password) 
      VALUES ('admin', '$2a$10$B00ZUSq2l8.S9v124H60QezcQ09b.I5p2Lg735P.l.q7bH7X.a1yC')
      ON CONFLICT (username) DO NOTHING;
    `);
    console.log('Usuario default admin insertado.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

run();
