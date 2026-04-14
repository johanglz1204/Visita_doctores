const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'visitadoctores_secret_key_2026';

// Carga usuarios desde variable de entorno USERS (JSON) o fallback a APP_USERNAME/APP_PASSWORD
function loadUsers() {
  if (process.env.USERS) {
    try {
      return JSON.parse(process.env.USERS);
    } catch (e) {
      console.error('⚠️  Variable USERS tiene formato JSON inválido. Usando credenciales por defecto.');
    }
  }
  // Fallback: usuario único
  return [
    {
      username: process.env.APP_USERNAME || 'admin',
      password: process.env.APP_PASSWORD || 'admin123',
    }
  ];
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Proporciona usuario y contraseña.' });
  }

  const users = loadUsers();
  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.status(401).json({ error: 'Credenciales inválidas.' });
  }

  const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ message: 'Login exitoso', token, username: user.username });
});

module.exports = router;
