const bcrypt = require('bcryptjs');
const db = require('./db');

async function updatePassword() {
  try {
    const hash = await bcrypt.hash('Johan123#', 10);
    await db.query('UPDATE users SET password = $1 WHERE username = $2', [hash, 'admin']);
    console.log('Password updated to Johan123# correctly.');
  } catch (err) {
    console.error('Error updating password:', err);
  } finally {
    process.exit(0);
  }
}

updatePassword();
