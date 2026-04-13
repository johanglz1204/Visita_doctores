const { z } = require('zod');

// Validador universal que recibe un esquema de Zod
function validateRequest(schema) {
  return (req, res, next) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Datos inválidos proporcionados',
          details: err.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
        });
      }
      res.status(500).json({ error: 'Error del servidor al validar' });
    }
  };
}

module.exports = { validateRequest };
