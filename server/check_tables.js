require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { queryMySQL } = require('./mysqlDb');

async function checkTables() {
  try {
    const tables = await queryMySQL("SHOW TABLES");
    console.log('--- Tablas en MySQL ---');
    console.log(tables.map(t => Object.values(t)[0]).filter(name => 
      name.toLowerCase().includes('articulo') || 
      name.toLowerCase().includes('inventario') ||
      name.toLowerCase().includes('hist')
    ));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkTables();
