const db = require('../db');

/**
 * Controller for Dashboard statistics and graphs
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const knex = db.knex;
    
    // We get current basic stats via Knex
    const [
      doctorsCount, productsCount, inventoryCount, criticalCount, recentSales
    ] = await Promise.all([
      knex('doctors').count('* as count'),
      knex('products').count('* as count'),
      knex('inventory_stocks').count('* as count'),
      knex('inventory_stocks')
        .whereRaw('current_stock <= 2 OR (target_stock > 0 AND (current_stock::numeric / target_stock) <= 0.2)')
        .count('* as count'),
      knex('sales_history as s')
        .leftJoin('doctors as d', 's.doctor_id', 'd.id')
        .leftJoin('products as p', 's.product_id', 'p.id')
        .select('s.*', 'd.name AS doctor_name', 'p.name AS product_name')
        .orderBy('s.sale_date', 'desc')
        .orderBy('s.created_at', 'desc')
        .limit(10) // Increased to 10 for better visibility
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
      
      // Top 5 doctors dynamically calculated (últimos 30 días)
      knex('sales_history as s')
        .leftJoin('doctors as d', 's.doctor_id', 'd.id')
        .select('d.name as doctor')
        .select(knex.raw("CAST(SUM(s.quantity) AS INT) as total_prescriptions"))
        .whereNotNull('d.name')
        .where('s.sale_date', '>=', thirtyDaysAgoStr)
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
      // lastSyncTime will be injected by the route handler if needed or we can pass it via req
      lastSyncTime: req.app.get('lastSyncTime') || null,
    });
  } catch (err) {
    next(err); // Pass to centralized error handler
  }
};

module.exports = {
  getDashboardStats
};
