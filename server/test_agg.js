require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { queryMySQL } = require('./mysqlDb');

async function getAggregatedRankings() {
  try {
    const rows = await queryMySQL(`
      SELECT 
        stramecop AS codigo, 
        STRNOMBRE AS nombre, 
        MAX(STRRANKING) AS max_ranking
      FROM tblclsarticulo
      WHERE STRRANKING IS NOT NULL AND STRRANKING <> ''
      GROUP BY stramecop, STRNOMBRE
      ORDER BY nombre
      LIMIT 20;
    `);
    console.log(rows);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
getAggregatedRankings();
