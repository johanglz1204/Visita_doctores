require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const db = require('../db');
const { cleanForDisplay } = require('../utils/stringUtils');

async function repairNames() {
  console.log('🧹 [Repair] Iniciando limpieza de nombres y fusión de duplicados...');
  
  try {
    const { rows: products } = await db.query('SELECT id, name, barcode FROM products');
    console.log(`📊 [Repair] Analizando ${products.length} productos...`);

    let cleanedCount = 0;
    let mergedCount = 0;

    for (const prod of products) {
      const cleaned = cleanForDisplay(prod.name);
      
      if (cleaned !== prod.name) {
        console.log(`✨ [Repair] Limpiando: "${prod.name}" -> "${cleaned}"`);
        
        try {
          // Intentar actualizar directamente
          await db.query('UPDATE products SET name = $1 WHERE id = $2', [cleaned, prod.id]);
          cleanedCount++;
        } catch (err) {
          if (err.code === '23505') { // Unique violation
            console.log(`🔗 [Repair] Detectada colisión para "${cleaned}". Iniciando fusión...`);
            
            // Encontrar el producto "limpio" existente
            const { rows: existing } = await db.query(
              'SELECT id FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))',
              [cleaned]
            );

            if (existing.length > 0) {
              const keepId = existing[0].id;
              const deleteId = prod.id;

              // Migrar registros
              const invUpdate = await db.query(
                'UPDATE inventory_stocks SET product_id = $1 WHERE product_id = $2',
                [keepId, deleteId]
              );
              const salesUpdate = await db.query(
                'UPDATE sales_history SET product_id = $1 WHERE product_id = $2',
                [keepId, deleteId]
              );
              
              // Eliminar el duplicado sucio
              await db.query('DELETE FROM products WHERE id = $1', [deleteId]);
              
              mergedCount++;
              console.log(`✅ [Repair] Fusión completada. Registros migrados: Inv(${invUpdate.rowCount}), Ventas(${salesUpdate.rowCount})`);
            }
          } else {
            console.error(`❌ [Repair] Error inesperado en "${prod.name}":`, err.message);
          }
        }
      }
    }

    console.log(`\n🎉 [Repair] RESULTADOS:`);
    console.log(`- Productos renombrados: ${cleanedCount}`);
    console.log(`- Productos fusionados (duplicados eliminados): ${mergedCount}`);

  } catch (err) {
    console.error('❌ [Repair] Error fatal:', err);
  } finally {
    process.exit();
  }
}

repairNames();
