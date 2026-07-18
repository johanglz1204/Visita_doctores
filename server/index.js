require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

// Environment Validation — DATABASE_URL is legacy (PostgreSQL), not needed for SQLite mode
const REQUIRED_ENV = ['JWT_SECRET'];
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
  console.warn(`\n⚠️  WARNING: Missing environment variables: ${missingEnv.join(', ')}. Using defaults.`);
}


const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./initialize_db');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
// We'll use app.set/get for global shared state instead of local vars
app.set('lastSyncTime', null);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// API Routes
app.use('/api/auth', require('./routes/auth'));

// Protect other API routes
const authenticate = require('./middlewares/authMiddleware');

app.use('/api/doctors', authenticate, require('./routes/doctors'));
app.use('/api/products', authenticate, require('./routes/products'));
app.use('/api/inventory', authenticate, require('./routes/inventory'));
app.use('/api/sales', authenticate, require('./routes/sales'));
app.use('/api/backup', authenticate, require('./routes/backup'));

// Stock Out History endpoint
app.get('/api/stock_out_history', authenticate, async (req, res) => {
  try {
    const db = require('./db');
    const { rows } = await db.query(`
      SELECT soh.*, p.name as product_name, p.ranking
      FROM stock_out_history soh
      LEFT JOIN products p ON soh.product_id = p.id
      ORDER BY soh.start_date DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// MySQL Inventory Sync routes
app.use('/api/mysql-sync', require('./routes/mysqlSync'));

// System Settings routes
app.use('/api/settings', authenticate, require('./routes/settings'));


// Dashboard stats endpoint (Protected)
const { getDashboardStats } = require('./controllers/dashboardController');
app.get('/api/dashboard', authenticate, getDashboardStats);

// Executive Report PDF (Protected)
const { generateExecutiveReport } = require('./controllers/reportController');
app.get('/api/reports/executive', authenticate, generateExecutiveReport);

// Endpoint para ver el último log de sincronización (Diagnóstico)
app.get('/api/sync/last-log', authenticate, async (req, res) => {
  try {
    const db = require('./db');
    const result = await db.query('SELECT * FROM mysql_sync_logs ORDER BY id DESC LIMIT 1');
    res.json(result.rows[0] || { message: 'No hay logs de sincronización aún.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Serve static frontend in production
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized Error Handling
app.use(require('./middlewares/errorMiddleware'));


// Automated DB Initialization on startup
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
  console.log(`📦 SICOIN server running on port ${PORT}`);
  console.log(`   Dashboard: http://localhost:${PORT}`);

  // DB CONSTRAINTS (Dedupe)
  db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_products_unique_name ON products (LOWER(TRIM(name)))")
    .then(() => console.log('✅ Index UNIQUE verified.'))
    .catch(e => console.error('⚠️ Index UNIQUE error:', e.message));

  // --- Configuración de tareas de fondo (Cron) ---
  const cron = require('node-cron');
  const { syncMySQLInventory } = require('./services/inventorySyncService');
  
  let mysqlSyncRunning = false;
  let currentCronTask = null;

  const runMySQLSync = async () => {
    if (mysqlSyncRunning) {
      console.log('⏭️  [MySQL Sync] Sync anterior aún en progreso, saltando...');
      return;
    }
    mysqlSyncRunning = true;
    const now = new Date().toLocaleTimeString('es-MX');
    console.log(`\n🔄 [${now}] Sincronizando existencias desde MySQL...`);
    try {
      const result = await syncMySQLInventory();
      if (result.success) {
        console.log(`✅ [${now}] MySQL Sync: ${result.updated} actualizados, ${result.unmatched} sin match.`);
      } else {
        console.error(`❌ [${now}] MySQL Sync falló: ${result.error}`);
      }
    } catch (err) {
      console.error(`❌ [${now}] Error inesperado en MySQL Sync:`, err.message);
    } finally {
      mysqlSyncRunning = false;
    }
  };

  const setupSyncCron = async () => {
    try {
      // Detener tarea anterior si existe
      if (currentCronTask) {
        currentCronTask.stop();
      }

      // Leer intervalo de la base de datos
      const { rows } = await db.query("SELECT value FROM settings WHERE key = 'sync_interval_minutes'");
      const interval = parseInt(rows[0]?.value) || 60;
      
      // Programar nueva tarea
      // Usamos formato de minutos: */N * * * *
      currentCronTask = cron.schedule(`*/${interval} * * * *`, runMySQLSync);
      console.log(`⏱️  MySQL Sync programado cada ${interval} minutos.`);
    } catch (err) {
      console.error('❌ Error configurando cron de sync:', err.message);
      // Fallback a 60 min si falla
      currentCronTask = cron.schedule('0 * * * *', runMySQLSync);
    }
  };

  // Exponer función de refresco para que las rutas de settings puedan llamarla
  app.set('refreshCron', setupSyncCron);

  // Ejecutar inmediatamente al arrancar, luego programar
  runMySQLSync();
  setupSyncCron();

  // --- Auto Backup every 24 hours ---
  const { generateSQLDump } = require('./routes/backup');
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

  // Ejecutar todos los días a las 03:00 AM
  cron.schedule('0 3 * * *', runAutoBackup);
  });
});
