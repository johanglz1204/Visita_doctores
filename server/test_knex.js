const db = require('./db');
const k = db.knex;

async function run() {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        console.log("Thirty days ago:", thirtyDaysAgoStr);

        const salesTrend = await k('sales_history')
        .select(k.raw('TO_CHAR(sale_date, \'YYYY-MM-DD\') as date'))
        .sum('quantity as total_quantity')
        .where('sale_date', '>=', thirtyDaysAgoStr)
        .groupBy('sale_date')
        .orderBy('sale_date', 'asc');

        console.log("Trend Data:", salesTrend);
    } catch(err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
run();
