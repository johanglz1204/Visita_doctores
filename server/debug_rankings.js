require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { queryMySQL } = require('./mysqlDb');
const db = require('./db');

async function debugRankings() {
  try {
    console.log("--- Búsqueda en MySQL ---");
    const mysqlRows = await queryMySQL(`
      SELECT stramecop AS codigo, STRNOMBRE AS nombre, STRRANKING AS ranking 
      FROM tblclsarticulo 
      WHERE stramecop IN ('7501314701957', '7501089808943', '7501101600524', '7501165006386')
    `);
    
    console.log(mysqlRows);

    console.log("\n--- Búsqueda en PostgreSQL ---");
    const { rows: pgRows } = await db.query(`
      SELECT id, name, barcode, ranking
      FROM products
      WHERE barcode IN ('7501314701957', '7501089808943', '7501101600524', '7501165006386')
    `);
    
    console.log(pgRows);

    console.log("\n--- Búsqueda de Rankings Nulos MySQL ---");
    const filterEmpty = mysqlRows.filter(r => !r.ranking || r.ranking.trim() === '');
    console.log("MySQL Vacíos: ", filterEmpty);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

debugRankings();
