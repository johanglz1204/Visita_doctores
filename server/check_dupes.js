const db = require('./db');
require('dotenv').config();

async function check() {
  try {
    const res = await db.query("SELECT id, name, barcode, ranking FROM products WHERE name ILIKE '%FARMAPRAM%' ORDER BY id;");
    console.log('--- DUPLICADOS FARMAPRAM ---');
    res.rows.forEach(r => {
      console.log(`ID: ${r.id} | NAME: "${r.name}" | BARCODE: "${r.barcode}" | RANKING: "${r.ranking}"`);
    });
    
    const countRes = await db.query(`
      SELECT LOWER(TRIM(name)) as norm_name, COUNT(*) 
      FROM products 
      GROUP BY LOWER(TRIM(name)) 
      HAVING COUNT(*) > 1 
      ORDER BY 2 DESC
      LIMIT 10;
    `);
    console.log('\n--- OTROS GRUPOS DUPLICADOS (Top 10) ---');
    console.table(countRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

check();
