const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'visitadoctores_secret_key_2026';

// Credenciales definidas como variables de entorno
// Si no están definidas, usa los valores por defecto
const APP_USERNAME = process.env.APP_USERNAME || 'admin';
const APP_PASSWORD = process.env.APP_PASSWORD || 'admin123';

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Proporciona usuario y contraseña.' });
  }

  // Comparación directa contra variables de entorno (sin base de datos)
  if (username !== APP_USERNAME || password !== APP_PASSWORD) {
    return res.status(401).json({ error: 'Credenciales inválidas.' });
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ message: 'Login exitoso', token, username });
});

module.exports = router;
