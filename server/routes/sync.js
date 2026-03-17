const express = require('express');
const router = express.Router();
const { syncEmails } = require('../emailService');

// POST /api/sync/emails
router.post('/emails', async (req, res) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      return res.status(400).json({ 
        error: 'Configuración de correo incompleta en el archivo .env (EMAIL_USER, EMAIL_PASSWORD)' 
      });
    }
    
    await syncEmails();
    res.json({ message: 'Sincronización de correos completada exitosamente' });
  } catch (err) {
    console.error('Error syncing emails:', err);
    res.status(500).json({ error: 'Error al sincronizar correos: ' + err.message });
  }
});

module.exports = router;
