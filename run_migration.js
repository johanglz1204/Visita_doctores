const db = require('./server/db');

async function migrate() {
  try {
    console.log('🚀 Starting migration: Merge duplicates and set unique constraints...');

    // 1. Enable unaccent if possible
    try {
      await db.query('CREATE EXTENSION IF NOT EXISTS unaccent;');
      console.log('✅ Extension unaccent enabled.');
    } catch (e) {
      console.log('⚠️ Could not enable unaccent (probably no superuser or already installed).');
    }

    // 2. Deep Merge 
    console.log('🧹 Merging existing duplicates...');
    const { rows: dupes } = await db.query(`
      SELECT 
        LOWER(TRIM(name)) as norm_name,
        ARRAY_AGG(id ORDER BY updated_at DESC, stock DESC) as id_list
      FROM products
      GROUP BY LOWER(TRIM(name))
      HAVING COUNT(*) > 1
    `);

    let mergedCount = 0;
    for (const group of dupes) {
      const [keepId, ...toDelete] = group.id_list;
      for (const oldId of toDelete) {
        // Link inventory_stocks to keepId
        await db.query('UPDATE inventory_stocks SET product_id = $1 WHERE product_id = $2', [keepId, oldId]);
        // Link sales_history to keepId
        await db.query('UPDATE sales_history SET product_id = $1 WHERE product_id = $2', [keepId, oldId]);
        // Delete the duplicate
        await db.query('DELETE FROM products WHERE id = $1', [oldId]);
        mergedCount++;
      }
    }
    console.log(`✅ Merged ${mergedCount} duplicates.`);

    // 3. Add UNIQUE index on name (normalized)
    // We use LOWER(TRIM(name)) to ensure case-insensitive and space-insensitive uniqueness
    console.log('🔒 Adding unique index on product name...');
    await db.query('DROP INDEX IF EXISTS idx_unique_normalized_name;');
    await db.query('CREATE UNIQUE INDEX idx_unique_normalized_name ON products (LOWER(TRIM(name)));');
    console.log('✅ Unique index created.');

    console.log('🎉 Migration successful!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    process.exit();
  }
}

migrate();
