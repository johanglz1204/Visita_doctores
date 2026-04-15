const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'visitadoctores_secret_key_2026';

function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Acceso denegado. No se proporcionó un token de seguridad.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. El formato del token es inválido.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Tu sesión ha expirado. Por favor, inicia sesión de nuevo.' });
    }
    res.status(403).json({ error: 'Token inválido o corrupto.' });
  }
}

module.exports = authenticate;

