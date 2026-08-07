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
initializeDatabase().then(async () => {
  // Deduplicate duplicate doctors (e.g. "DR ADOLFO MARTINEZ TAPIA" vs "ADOLFO MARTINEZ TAPIA")
  try {
    const { rows: doctors } = await db.query('SELECT id, name FROM doctors');
    const cleanName = (str) => {
      if (!str) return '';
      return str
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/^(DR|DRA)\.?\s+/i, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
    };

    const cleanGroups = {};
    for (const doc of doctors) {
      const cleaned = cleanName(doc.name);
      if (!cleanGroups[cleaned]) {
        cleanGroups[cleaned] = [];
      }
      cleanGroups[cleaned].push(doc);
    }

    for (const [cleanedName, group] of Object.entries(cleanGroups)) {
      if (group.length > 1) {
        group.sort((a, b) => {
          const aHasPrefix = /^(DR|DRA)\.?\s+/i.test(a.name);
          const bHasPrefix = /^(DR|DRA)\.?\s+/i.test(b.name);
          if (aHasPrefix && !bHasPrefix) return 1;
          if (!aHasPrefix && bHasPrefix) return -1;
          return a.id - b.id;
        });

        const keepDoc = group[0];
        const duplicates = group.slice(1);
        
        console.log(`🧹 [Deduplicate] Fusionando duplicados de doctor "${keepDoc.name}" (ID ${keepDoc.id}):`);
        
        for (const dup of duplicates) {
          console.log(`   - Fusionando "${dup.name}" (ID ${dup.id}) -> "${keepDoc.name}"`);
          
          await db.query('UPDATE sales_history SET doctor_id = $1 WHERE doctor_id = $2', [keepDoc.id, dup.id]);
          
          const { rows: keepStocks } = await db.query('SELECT product_id, target_stock, current_stock FROM inventory_stocks WHERE doctor_id = $1', [keepDoc.id]);
          const { rows: dupStocks } = await db.query('SELECT product_id, target_stock, current_stock FROM inventory_stocks WHERE doctor_id = $1', [dup.id]);
          
          for (const dupStock of dupStocks) {
            const match = keepStocks.find(k => k.product_id === dupStock.product_id);
            if (match) {
              const newTarget = Math.max(match.target_stock, dupStock.target_stock);
              const newCurrent = Math.max(match.current_stock, dupStock.current_stock);
              await db.query(
                'UPDATE inventory_stocks SET target_stock = $1, current_stock = $2, updated_at = CURRENT_TIMESTAMP WHERE doctor_id = $3 AND product_id = $4',
                [newTarget, newCurrent, keepDoc.id, dupStock.product_id]
              );
            } else {
              await db.query('UPDATE inventory_stocks SET doctor_id = $1 WHERE doctor_id = $2 AND product_id = $3', [keepDoc.id, dup.id, dupStock.product_id]);
            }
          }
          await db.query('DELETE FROM inventory_stocks WHERE doctor_id = $1', [dup.id]);
          
          try {
            await db.query('UPDATE doctor_visits SET doctor_id = $1 WHERE doctor_id = $2', [keepDoc.id, dup.id]);
          } catch (e) {}
          
          await db.query('DELETE FROM doctors WHERE id = $1', [dup.id]);
        }
      }
    }
  } catch (err) {
    console.error('❌ [Deduplicate] Error al fusionar doctores duplicados:', err);
  }

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

  // --- Sales Sync from MySQL (Ventas por Doctor) ---
  const { syncMySQLSales } = require('./services/salesSyncService');
  let salesSyncRunning = false;

  const runSalesSync = async () => {
    if (salesSyncRunning) {
      console.log('⏭️  [Sales Sync] Sync anterior aún en progreso, saltando...');
      return;
    }
    salesSyncRunning = true;
    const now = new Date().toLocaleTimeString('es-MX');
    console.log(`\n🧾 [${now}] Sincronizando ventas por doctor desde MySQL...`);
    try {
      const result = await syncMySQLSales(60); // últimos 60 días
      if (result.success) {
        console.log(`✅ [${now}] Sales Sync: ${result.new_records} nuevos, ${result.skipped_duplicates} duplicados.`);
      } else {
        console.error(`❌ [${now}] Sales Sync falló: ${result.error}`);
      }
    } catch (err) {
      console.error(`❌ [${now}] Error inesperado en Sales Sync:`, err.message);
    } finally {
      salesSyncRunning = false;
    }
  };

  // Ejecutar sync de ventas al arrancar (después de un delay para no saturar)
  setTimeout(runSalesSync, 10000); // 10s después del start
  // Programar cada hora
  cron.schedule('30 * * * *', runSalesSync); // minuto 30 de cada hora

  // Endpoint manual para forzar sync de ventas
  app.post('/api/sales-sync/trigger', authenticate, async (req, res) => {
    if (salesSyncRunning) {
      return res.status(409).json({ error: 'Sincronización de ventas ya en progreso' });
    }
    const days = parseInt(req.query.days) || 60;
    try {
      const result = await syncMySQLSales(days);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Endpoint para ver estado del último sync de ventas
  app.get('/api/sales-sync/status', authenticate, async (req, res) => {
    try {
      const { rows } = await db.query('SELECT * FROM sales_sync_logs ORDER BY id DESC LIMIT 10');
      res.json({ history: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

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
