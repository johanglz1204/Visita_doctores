const mysql = require('mysql2/promise');
async function run() {
  const c = await mysql.createConnection({host:'192.168.1.199', user:'visitadoc_reader', password:'VDReader2026!', database:'dbsicofa'});
  const [rows] = await c.query('DESCRIBE tblclsarticulo');
  console.log(rows.map(r=>r.Field).join(', '));
  const [count] = await c.query('SELECT count(distinct stramecop) FROM tblclsarticulo');
  console.log('Total unique products:', count);
  const [countActive] = await c.query('SELECT count(distinct stramecop) FROM tblclsarticulo WHERE INTEXISTENCIA <> 0');
  console.log('Products with non-zero stock:', countActive);
  c.end();
}
run();
