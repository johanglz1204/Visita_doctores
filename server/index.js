require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/products', require('./routes/products'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/sales', require('./routes/sales'));

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
        ORDER BY s.created_at DESC LIMIT 5
      `),
    ]);

    res.json({
      totalDoctors: parseInt(doctors.rows[0].count),
      totalProducts: parseInt(products.rows[0].count),
      totalInventory: parseInt(inventory.rows[0].count),
      criticalAlerts: parseInt(criticalRaw.rows[0].count),
      recentSales: recentSales.rows,
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
});
