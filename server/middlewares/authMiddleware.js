const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'visitadoctores_secret_key_2026';

function authenticate(req, res, next) {
  // Bypassed for local mode
  req.user = { username: 'admin' };
  next();
}

module.exports = authenticate;

