const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middlewares/authMiddleware');

// GET /api/settings
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT key, value FROM settings');
    const settingsObj = {};
    rows.forEach(r => {
      settingsObj[r.key] = r.value;
    });
    res.json(settingsObj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings
router.put('/', authenticate, async (req, res) => {
  try {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
      await db.query(`
        INSERT INTO settings (key, value)
        VALUES ($1, $2)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `, [key, String(value)]);
    }
    
    // Si cambió el intervalo de sync, notificar al servidor principal para reiniciar cron
    if (settings.sync_interval_minutes) {
      const app = req.app;
      if (app.get('refreshCron')) {
        app.get('refreshCron')();
      }
    }

    res.json({ message: 'Configuración actualizada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
