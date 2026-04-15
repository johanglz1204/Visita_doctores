/**
 * Centralized Error Handling Middleware
 */
function errorMiddleware(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.url}:`, err);

  const status = err.status || 500;
  const message = err.message || 'Error interno del servidor';

  // Omit details in production for security, but we'll keep it simple for now as per project context
  res.status(status).json({
    error: message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}

module.exports = errorMiddleware;
