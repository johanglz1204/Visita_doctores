/**
 * Simple In-memory Rate Limiter
 * (In production with multiple instances, use Redis or express-rate-limit with a store)
 */
const rateLimitStore = new Map();

function rateLimit(options) {
  const { windowMs, max, message } = options;

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!rateLimitStore.has(ip)) {
      rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const record = rateLimitStore.get(ip);

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }

    record.count++;

    if (record.count > max) {
      return res.status(429).json({ error: message || 'Demasiadas solicitudes. Intentalo de nuevo más tarde.' });
    }

    next();
  };
}

module.exports = rateLimit;
