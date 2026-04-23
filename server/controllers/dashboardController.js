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

    // 2. Data for Graphs (Reporting Suite)
    const days = parseInt(req.query.days) || 30;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - days);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    // Previous period for growth comparison
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - (days * 2));
    const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split('T')[0];
    
    const [
      salesTrendRows, 
      topDoctorsRows,
      urgentDoctorsRows,
      sucursalRows,
      lineStatsRows,
      currentSalesSum,
      previousSalesSum,
      inventoryForecastRows,
      criticalRankedProducts
    ] = await Promise.all([
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
        .limit(10),

      // Sales by Sucursal (Regional Distribution)
      knex('sales_history')
        .select(knex.raw("COALESCE(NULLIF(sucursal, ''), 'GENERAL') as name"))
        .select(knex.raw("CAST(SUM(quantity) AS INT) as value"))
        .where('sale_date', '>=', thirtyDaysAgoStr)
        .groupBy('sucursal')
        .orderBy('value', 'desc'),

      // Sales by Product Line (First word of name)
      knex('sales_history as s')
        .join('products as p', 's.product_id', 'p.id')
        .select(knex.raw("split_part(p.name, ' ', 1) as line"))
        .select(knex.raw("CAST(SUM(s.quantity) AS INT) as value"))
        .where('s.sale_date', '>=', thirtyDaysAgoStr)
        .groupByRaw("split_part(p.name, ' ', 1)")
        .orderBy('value', 'desc')
        .limit(8),

      // Totals for Growth indicator
      knex('sales_history').where('sale_date', '>=', thirtyDaysAgoStr).sum('quantity as total'),
      knex('sales_history').whereBetween('sale_date', [sixtyDaysAgoStr, thirtyDaysAgoStr]).sum('quantity as total'),

      // Inventory Forecast (Days of stock left)
      // Logic: current_stock / (sum_quantity_30_days / 30)
      knex('products as p')
        .leftJoin(
          knex('sales_history')
            .select('product_id')
            .select(knex.raw('SUM(quantity) as total_30d'))
            .where('sale_date', '>=', thirtyDaysAgoStr)
            .groupBy('product_id')
            .as('s'),
          'p.id', 's.product_id'
        )
        .select('p.name', 'p.stock', 'p.ranking', 'p.min_stock')
        .select(knex.raw('COALESCE(s.total_30d, 0) as sales_30d'))
        .select(knex.raw('CASE WHEN COALESCE(s.total_30d, 0) > 0 THEN ROUND(p.stock / (CAST(s.total_30d AS NUMERIC) / 30)) ELSE 999 END as days_left'))
        .orderByRaw("CASE WHEN p.ranking IN ('AA', 'A') THEN 0 ELSE 1 END")
        .orderBy('days_left', 'asc')
        .limit(20),
        
      // Critical Ranked Products (Riesgo de Desabasto para AA y A)
      knex('products')
        .select('name', 'stock', 'min_stock', 'ranking')
        .whereIn('ranking', ['AA', 'A'])
        .andWhereRaw('stock <= COALESCE(min_stock, 5)')
        .orderBy('stock', 'asc')
    ]);

    // Calculate growth percentage
    const curVal = parseInt(currentSalesSum[0].total) || 0;
    const prevVal = parseInt(previousSalesSum[0].total) || 0;
    const growth = prevVal === 0 ? 0 : Math.round(((curVal - prevVal) / prevVal) * 100);

    res.json({
      totalDoctors: parseInt(doctorsCount[0].count),
      totalProducts: parseInt(productsCount[0].count),
      totalInventory: parseInt(inventoryCount[0].count),
      criticalAlerts: parseInt(criticalCount[0].count),
      recentSales,
      salesTrend: salesTrendRows,
      topDoctors: topDoctorsRows,
      urgentDoctors: urgentDoctorsRows,
      sucursalStats: sucursalRows,
      lineStats: lineStatsRows,
      growth,
      inventoryForecast: inventoryForecastRows,
      criticalRankedProducts,
      lastSyncTime: req.app.get('lastSyncTime') || null,
    });
  } catch (err) {
    next(err); // Pass to centralized error handler
  }
};

module.exports = {
  getDashboardStats
};
