const db = require('./server/db');

async function checkLogs() {
  try {
    const { rows } = await db.query(`
      SELECT synced_at, total_mysql, matched, unmatched, unmatched_list 
      FROM mysql_sync_logs 
      ORDER BY synced_at DESC 
      LIMIT 1;
    `);
    
    if (rows.length === 0) {
      console.log('No logs found.');
      return;
    }

    const log = rows[0];
    console.log(`--- LAST SYNC LOG (${log.synced_at}) ---`);
    console.log(`Total MySQL: ${log.total_mysql} | Matched: ${log.matched} | Unmatched: ${log.unmatched}`);
    
    const unmatched = Array.isArray(log.unmatched_list) ? log.unmatched_list : JSON.parse(log.unmatched_list || '[]');
    console.log('\n--- SAMPLE UNMATCHED (First 20) ---');
    unmatched.slice(0, 20).forEach(u => {
      console.log(`CODE: ${u.codigo} | NAME: ${u.nombre} | STOCK: ${u.existencia}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkLogs();
