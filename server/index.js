require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./initialize_db');

const app = express();
const PORT = process.env.PORT || 3000;
let lastSyncTime = null; // persisted in memory between syncs

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
syncRouter.setLastSyncSetter((t) => { lastSyncTime = t; });
app.use('/api/sync', authenticate, syncRouter);


// Dashboard stats endpoint (Protected)
app.get('/api/dashboard', authenticate, async (req, res) => {
  try {
    const db = require('./db');
    const knex = db.knex;
    
    // We get current basic stats via Knex now
    const [
      doctorsCount, productsCount, inventoryCount, criticalCount, recentSales
    ] = await Promise.all([
      knex('doctors').count('* as count'),
      knex('products').count('* as count'),
      knex('inventory_stocks').count('* as count'),
      knex('inventory_stocks').whereRaw('current_stock <= 2 OR (target_stock > 0 AND (current_stock::numeric / target_stock) <= 0.2)').count('* as count'),
      knex('sales_history as s')
        .leftJoin('doctors as d', 's.doctor_id', 'd.id')
        .leftJoin('products as p', 's.product_id', 'p.id')
        .select('s.*', 'd.name AS doctor_name', 'p.name AS product_name')
        .orderBy('s.sale_date', 'desc').orderBy('s.created_at', 'desc').limit(5)
    ]);

    // Data for Graphs (Reporting Suite)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
    
    const [salesTrendRows, topDoctorsRows, urgentDoctorsRows] = await Promise.all([
      // Sales grouped by Date for LineChart (last 30 days)
      knex('sales_history')
        .select(knex.raw("TO_CHAR(sale_date, 'YYYY-MM-DD') as date"))
        .select(knex.raw("CAST(SUM(quantity) AS INT) as total_quantity"))
        .where('sale_date', '>=', thirtyDaysAgoStr)
        .groupBy('sale_date')
        .orderBy('sale_date', 'asc'),
      
      // Top 5 doctors dynamically calculated
      knex('sales_history as s')
        .leftJoin('doctors as d', 's.doctor_id', 'd.id')
        .select('d.name as doctor')
        .select(knex.raw("CAST(SUM(s.quantity) AS INT) as total_prescriptions"))
        .whereNotNull('d.name')
        .whereRaw('EXTRACT(MONTH FROM s.sale_date) = EXTRACT(MONTH FROM NOW())')
        .groupBy('d.name')
        .orderBy('total_prescriptions', 'desc')
        .limit(5),
        
      // Urgent Doctors to Visit (Rutero Inteligente)
      knex('doctors as d')
        .join('sales_history as s', 'd.id', 's.doctor_id')
        .select('d.id', 'd.name', 'd.phone')
        .select(knex.raw('MAX(s.sale_date) as last_sale_date'))
        .select(knex.raw("DATE_PART('day', NOW() - MAX(s.sale_date)) as inactive_days"))
        .groupBy('d.id', 'd.name', 'd.phone')
        .having(knex.raw("DATE_PART('day', NOW() - MAX(s.sale_date)) >= 30"))
        .orderBy('inactive_days', 'desc')
        .limit(10)
    ]);

    res.json({
      totalDoctors: parseInt(doctorsCount[0].count),
      totalProducts: parseInt(productsCount[0].count),
      totalInventory: parseInt(inventoryCount[0].count),
      criticalAlerts: parseInt(criticalCount[0].count),
      recentSales,
      salesTrend: salesTrendRows,
      topDoctors: topDoctorsRows,
      urgentDoctors: urgentDoctorsRows,
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
      lastSyncTime = new Date().toISOString();
      console.log(`✅ [${now}] Sincronización automática completada.`);
    } catch (err) {
      console.error(`❌ [${now}] Error en sincronización automática:`, err.message);
    }
  };

  // Ejecutar a los minutos 00 y 30 de dada hora
  cron.schedule('0,30 * * * *', runAutoSync);
  console.log(`⏱️  Sincronización automática programada con Cron (*/30).`);

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
