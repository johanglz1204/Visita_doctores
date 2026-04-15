require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

// Environment Validation
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'EMAIL_USER', 'EMAIL_PASSWORD'];
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`\n❌ FATAL ERROR: Missing environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}


const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./initialize_db');

const app = express();
const PORT = process.env.PORT || 3000;
// We'll use app.set/get for global shared state instead of local vars
app.set('lastSyncTime', null);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', require('./routes/auth'));

// Protect other API routes
const authenticate = require('./middlewares/authMiddleware');

app.use('/api/doctors', authenticate, require('./routes/doctors'));
app.use('/api/products', authenticate, require('./routes/products'));
app.use('/api/inventory', authenticate, require('./routes/inventory'));
app.use('/api/sales', authenticate, require('./routes/sales'));
app.use('/api/backup', authenticate, require('./routes/backup'));

const syncRouter = require('./routes/sync');
syncRouter.setLastSyncSetter((t) => { 
  app.set('lastSyncTime', t);
});
app.use('/api/sync', authenticate, syncRouter);

// MySQL Inventory Sync routes
app.use('/api/mysql-sync', require('./routes/mysqlSync'));


// Dashboard stats endpoint (Protected)
const { getDashboardStats } = require('./controllers/dashboardController');
app.get('/api/dashboard', authenticate, getDashboardStats);


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
  console.log(`🏥 VisitaDoctores server running on port ${PORT}`);
  console.log(`   Dashboard: http://localhost:${PORT}`);

  // --- Configuración de tareas de fondo (Cron) ---
  const cron = require('node-cron');
  
  // --- Auto Email Sync cada 30 minutos ---
  const { syncEmails } = require('./emailService');

  const runAutoSync = async () => {
    const now = new Date().toLocaleTimeString('es-MX');
    console.log(`\n🔄 [${now}] Iniciando sincronización automática de correos...`);
    try {
      await syncEmails();
      app.set('lastSyncTime', new Date().toISOString());
      console.log(`✅ [${now}] Sincronización automática completada.`);
    } catch (err) {
      console.error(`❌ [${now}] Error en sincronización automática:`, err.message);
    }
  };

  // Ejecutar a los minutos 00 y 30 de dada hora
  cron.schedule('0,30 * * * *', runAutoSync);
  console.log(`⏱️  Sincronización automática programada con Cron (*/30).`);

  // --- Auto MySQL Inventory Sync cada 5 minutos ---
  const { syncMySQLInventory } = require('./services/inventorySyncService');
  let mysqlSyncRunning = false;

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

  // Ejecutar inmediatamente al arrancar, luego cada 5 minutos
  runMySQLSync();
  cron.schedule('*/5 * * * *', runMySQLSync);
  console.log(`⏱️  MySQL Sync programado cada 5 minutos.`);

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

  // Ejecutar todos los días a las 03:00 AM
  cron.schedule('0 3 * * *', runAutoBackup);
  });
});
