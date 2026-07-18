require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { syncMySQLInventory } = require('./services/inventorySyncService');
const db = require('./db');

async function testSyncNoRankings() {
  try {
    // 1. Tomar un producto de ejemplo
    const { rows: products } = await db.query("SELECT id, name, barcode, ranking FROM products WHERE barcode IS NOT NULL LIMIT 1");
    if (products.length === 0) {
      console.log("No products with barcode found for test.");
      return;
    }
    const target = products[0];
    const oldRanking = target.ranking;
    console.log(`Product: ${target.name}, Barcode: ${target.barcode}, Current Ranking: ${oldRanking}`);

    // 2. Ejecutar sync
    console.log("Ejecutando sync...");
    const result = await syncMySQLInventory();
    console.log(`Sync result: ${result.updated} updated.`);

    // 3. Verificar ranking
    const { rows: updatedProducts } = await db.query("SELECT ranking FROM products WHERE id = $1", [target.id]);
    const newRanking = updatedProducts[0].ranking;
    console.log(`New Ranking: ${newRanking}`);

    if (oldRanking === newRanking) {
      console.log("✅ SUCCESS: Ranking remained the same.");
    } else {
      console.log("❌ FAILURE: Ranking changed!");
    }

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

testSyncNoRankings();
