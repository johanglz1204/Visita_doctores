const db = require('../db');

/**
 * Controller for advanced inventory planning and suggestions
 */
const getSuggestedOrders = async (req, res, next) => {
  try {
    const knex = db.knex;
    
    // Suggest orders for products where stock < target_stock
    // Usually focused on AA and A rankings
    const suggestions = await knex('products')
      .select('id', 'name', 'ranking', 'stock', 'min_stock', 'target_stock', 'price')
      .whereRaw('stock < target_stock')
      .orWhereRaw('stock <= min_stock')
      .orderByRaw("CASE WHEN ranking IN ('AA', 'A') THEN 0 ELSE 1 END")
      .orderBy('ranking', 'asc');

    const formattedSuggestions = suggestions.map(p => {
      // Calculate suggested quantity: fill to target_stock or at least min_stock + buffer
      const target = p.target_stock > 0 ? p.target_stock : (p.min_stock * 2);
      const suggested_qty = Math.max(0, target - p.stock);
      
      return {
        ...p,
        target_used: target,
        suggested_qty,
        estimated_cost: suggested_qty * (parseFloat(p.price) || 0)
      };
    }).filter(p => p.suggested_qty > 0);

    res.json(formattedSuggestions);
  } catch (err) {
    next(err);
  }
};

const recalculateDynamicMinStock = async (req, res, next) => {
  try {
    const { safetyDays = 15, ranking = 'AA,A' } = req.body;
    const knex = db.knex;
    
    const rankingList = ranking.split(',').map(r => r.trim());
    
    // Get sales of the last 90 days for products in the ranking
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

    const salesStats = await knex('sales_history as s')
      .join('products as p', 's.product_id', 'p.id')
      .select('p.id', 'p.name', 'p.ranking')
      .select(knex.raw('SUM(s.quantity) as total_qty'))
      .where('s.sale_date', '>=', ninetyDaysAgoStr)
      .whereIn('p.ranking', rankingList)
      .groupBy('p.id', 'p.name', 'p.ranking');

    const updates = [];
    for (const stat of salesStats) {
      const avgDailySales = parseFloat(stat.total_qty) / 90;
      const newMinStock = Math.ceil(avgDailySales * safetyDays);
      
      // Update the product
      await knex('products')
        .where('id', stat.id)
        .update({ 
          min_stock: newMinStock,
          target_stock: newMinStock * 2, // Suggest target as 2x min_stock
          updated_at: knex.fn.now()
        });
        
      updates.push({
        id: stat.id,
        name: stat.name,
        old_min: stat.min_stock, // stat from knex join might not have it unless selected
        new_min: newMinStock
      });
    }

    res.json({
      message: `Recálculo completado para ${updates.length} productos.`,
      updates
    });
  } catch (err) {
    next(err);
  }
};

const getStockOutHistory = async (req, res, next) => {
  try {
    const knex = db.knex;
    const history = await knex('stock_out_history as h')
      .join('products as p', 'h.product_id', 'p.id')
      .select('h.*', 'p.name as product_name', 'p.ranking', 'p.price')
      .orderBy('h.start_date', 'desc')
      .limit(100);

    res.json(history);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSuggestedOrders,
  recalculateDynamicMinStock,
  getStockOutHistory
};
