const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('../middlewares/rateLimit');

const JWT_SECRET = process.env.JWT_SECRET || 'visitadoctores_secret_key_2026';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'visitadoctores_refresh_key_2026';

// Rate limiter for login: max 5 requests per 15 minutes
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Demasiados intentos de inicio de sesión. Por favor, intenta de nuevo en 15 minutos.'
});

// Carga usuarios desde variable de entorno USERS (JSON) o fallback a APP_USERNAME/APP_PASSWORD
function loadUsers() {
  if (process.env.USERS) {
    try {
      return JSON.parse(process.env.USERS);
    } catch (e) {
      console.error('⚠️  Variable USERS tiene formato JSON inválido. Usando credenciales por defecto.');
    }
  }
  return [
    {
      username: process.env.APP_USERNAME || 'admin',
      password: process.env.APP_PASSWORD || 'admin123',
    }
  ];
}

// 1. LOGIN: Devuelve accessToken (15m) y refreshToken (24h)
router.post('/login', loginLimit, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Proporciona usuario y contraseña.' });
  }

  const users = loadUsers();
  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.status(401).json({ error: 'Credenciales inválidas.' });
  }

  // Access Token: Corto (15 min)
  const accessToken = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '15m' });
  
  // Refresh Token: Largo (24h)
  const refreshToken = jwt.sign({ username: user.username }, REFRESH_SECRET, { expiresIn: '24h' });

  res.json({ 
    message: 'Login exitoso', 
    accessToken, 
    refreshToken,
    username: user.username 
  });
});

// 2. REFRESH: Genera un nuevo accessToken usando un refreshToken válido
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token no proporcionado.' });
  }

  try {
    const payload = jwt.verify(refreshToken, REFRESH_SECRET);
    
    // Generar nuevo Access Token
    const accessToken = jwt.sign({ username: payload.username }, JWT_SECRET, { expiresIn: '15m' });
    
    res.json({ accessToken });
  } catch (err) {
    return res.status(403).json({ error: 'Refresh token inválido o expirado.' });
  }
});

module.exports = router;

