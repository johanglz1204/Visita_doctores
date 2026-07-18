require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { queryMySQL } = require('./mysqlDb');

async function checkSchema() {
  try {
    const columns = await queryMySQL('DESCRIBE tblclsarticulo');
    console.log('--- Columnas de tblclsarticulo ---');
    console.table(columns.map(c => ({ Field: c.Field, Type: c.Type })));

    // También buscar columnas que se llamen algo con "fecha" o "date" o "dtm"
    const dateColumns = columns.filter(c => 
      c.Field.toLowerCase().includes('fecha') || 
      c.Field.toLowerCase().includes('date') || 
      c.Field.toLowerCase().includes('dtm') ||
      c.Field.toLowerCase().includes('timestamp')
    );
    console.log('\n--- Columnas potenciales de tiempo ---');
    console.table(dateColumns.map(c => ({ Field: c.Field, Type: c.Type })));

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkSchema();
