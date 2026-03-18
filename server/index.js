require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
let lastSyncTime = null; // persisted in memory between syncs

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/products', require('./routes/products'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/backup', require('./routes/backup'));
const syncRouter = require('./routes/sync');
syncRouter.setLastSyncSetter((t) => { lastSyncTime = t; });
app.use('/api/sync', syncRouter);


// Dashboard stats endpoint
app.get('/api/dashboard', async (req, res) => {
  try {
    const db = require('./db');
    const [doctors, products, inventory, criticalRaw, recentSales] = await Promise.all([
      db.query('SELECT COUNT(*) AS count FROM doctors'),
      db.query('SELECT COUNT(*) AS count FROM products'),
      db.query('SELECT COUNT(*) AS count FROM inventory_stocks'),
      db.query(`
        SELECT COUNT(*) AS count FROM inventory_stocks 
        WHERE current_stock <= 2 
           OR (target_stock > 0 AND (current_stock::numeric / target_stock) <= 0.2)
      `),
      db.query(`
        SELECT s.*, d.name AS doctor_name, p.name AS product_name, p.presentation
        FROM sales_history s
        LEFT JOIN doctors d ON s.doctor_id = d.id
        LEFT JOIN products p ON s.product_id = p.id
        ORDER BY s.sale_date DESC, s.created_at DESC LIMIT 5
      `),
    ]);

    res.json({
      totalDoctors: parseInt(doctors.rows[0].count),
      totalProducts: parseInt(products.rows[0].count),
      totalInventory: parseInt(inventory.rows[0].count),
      criticalAlerts: parseInt(criticalRaw.rows[0].count),
      recentSales: recentSales.rows,
      lastSyncTime,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Error al cargar dashboard' });
  }
});

// Serve static frontend in production
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🏥 VisitaDoctores server running on port ${PORT}`);
  console.log(`   Dashboard: http://localhost:${PORT}`);

  // --- Auto Email Sync every 30 minutes ---
  const { syncEmails } = require('./emailService');
  const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

  const runAutoSync = async () => {
    const now = new Date().toLocaleTimeString('es-MX');
    console.log(`\n🔄 [${now}] Iniciando sincronización automática de correos...`);
    try {
      await syncEmails();
      lastSyncTime = new Date().toISOString();
      console.log(`✅ [${now}] Sincronización automática completada.`);
    } catch (err) {
      console.error(`❌ [${now}] Error en sincronización automática:`, err.message);
    }
  };

  // Run once 1 minute after startup, then every 30 minutes
  setTimeout(() => {
    runAutoSync();
    setInterval(runAutoSync, SYNC_INTERVAL_MS);
  }, 60 * 1000);

  console.log(`⏱️  Sincronización automática programada cada 30 minutos.`);

  // --- Auto Backup every 24 hours ---
  const { generateSQLDump } = require('./routes/backup');
  const fs = require('fs');
  const path = require('path');
  const BACKUP_PATH = path.join(__dirname, '..', 'backup_auto.sql');

  const runAutoBackup = async () => {
    try {
      const sql = await generateSQLDump();
      fs.writeFileSync(BACKUP_PATH, sql, 'utf8');
      console.log(`💾 [Auto-Backup] Respaldo guardado en ${BACKUP_PATH}`);
    } catch (err) {
      console.error('❌ [Auto-Backup] Error:', err.message);
    }
  };

  // Run 5 min after startup, then every 24 hours
  setTimeout(() => {
    runAutoBackup();
    setInterval(runAutoBackup, 24 * 60 * 60 * 1000);
  }, 5 * 60 * 1000);

  console.log(`💾 Respaldo automático programado cada 24 horas.`);
});
