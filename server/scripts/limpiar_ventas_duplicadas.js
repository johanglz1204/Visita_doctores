/**
 * limpiar_ventas_duplicadas.js
 *
 * Elimina renglones de sales_history cargados por correo/manual que
 * corresponden a un ticket que YA fue sincronizado desde MySQL.
 *
 * ¿Por qué hace falta?
 * Los renglones de origen "manual" (carga por correo de FarmaLike) no guardan
 * el folio de venta en mysql_ref, solo el número de ticket dentro de raw_text.
 * Como la deduplicación del sync se basa en mysql_ref, al recuperar el
 * histórico desde SICOFA la misma venta queda dos veces: una del correo y otra
 * del sync. Eso infla tanto las piezas por producto como el conteo de recetas.
 *
 * El renglón de MySQL es el que se conserva: trae folio, sucursal y producto
 * vinculado al catálogo. El del correo es el que se descarta.
 *
 * USO (desde la carpeta del proyecto):
 *   node server/scripts/limpiar_ventas_duplicadas.js           -> solo reporta (no borra)
 *   node server/scripts/limpiar_ventas_duplicadas.js --aplicar  -> borra de verdad
 *
 * Conviene correrlo DESPUÉS de recuperar el histórico de ventas, porque los
 * duplicados solo son detectables cuando ya existe la contraparte de MySQL.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const path = require('path');
const knex = require('knex')({
  client: 'sqlite3',
  connection: { filename: path.join(__dirname, '..', '..', 'database.sqlite') },
  useNullAsDefault: true
});

const APLICAR = process.argv.includes('--aplicar');

async function main() {
  console.log('═'.repeat(60));
  console.log(APLICAR ? '  LIMPIEZA DE VENTAS DUPLICADAS (APLICANDO CAMBIOS)' : '  LIMPIEZA DE VENTAS DUPLICADAS (SOLO REPORTE)');
  console.log('═'.repeat(60));

  // Renglones manuales que traen número de ticket en raw_text
  const manuales = await knex('sales_history')
    .whereNot('source', 'mysql')
    .whereRaw("raw_text LIKE '%Ticket %'")
    .select('id', 'doctor_id', 'product_id', 'sale_date', 'quantity', 'raw_text');

  console.log(`\nRenglones manuales con ticket: ${manuales.length}`);

  // Índice de folios ya presentes vía MySQL (mysql_ref = "sucursal-venta-producto")
  const refs = await knex('sales_history')
    .where('source', 'mysql')
    .whereNotNull('mysql_ref')
    .select('mysql_ref');

  const ventasEnMySQL = new Set(
    refs.map(r => String(r.mysql_ref).split('-')[1]).filter(Boolean)
  );
  console.log(`Folios distintos sincronizados desde MySQL: ${ventasEnMySQL.size}`);

  const aBorrar = [];
  for (const m of manuales) {
    const ticket = (String(m.raw_text || '').match(/Ticket\s+(\d+)/) || [])[1];
    if (ticket && ventasEnMySQL.has(ticket)) aBorrar.push({ ...m, ticket });
  }

  const piezas = aBorrar.reduce((a, r) => a + Number(r.quantity || 0), 0);
  const doctores = new Set(aBorrar.map(r => r.doctor_id));
  const conProducto = aBorrar.filter(r => r.product_id).length;

  console.log('\n── Duplicados detectados ──');
  console.log(`  Renglones:            ${aBorrar.length}`);
  console.log(`  Piezas:               ${piezas}`);
  console.log(`  Con producto ligado:  ${conProducto} (inflaban "Top Productos")`);
  console.log(`  Doctores afectados:   ${doctores.size}`);

  if (aBorrar.length === 0) {
    console.log('\n✅ No hay nada que limpiar.');
    await knex.destroy();
    return;
  }

  console.log('\n  Muestra:');
  aBorrar.slice(0, 5).forEach(r =>
    console.log(`    ticket ${r.ticket} | ${r.sale_date} | doctor ${r.doctor_id} | ${r.quantity} pza`)
  );

  if (!APLICAR) {
    console.log('\n⚠️  Modo reporte: no se borró nada.');
    console.log('   Para aplicar:  node server/scripts/limpiar_ventas_duplicadas.js --aplicar');
    await knex.destroy();
    return;
  }

  // Respaldo de lo que se va a borrar, por si hay que revisarlo después
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const respaldo = path.join(__dirname, '..', '..', 'backups', `duplicados_borrados_${stamp}.json`);
  require('fs').mkdirSync(path.dirname(respaldo), { recursive: true });
  require('fs').writeFileSync(respaldo, JSON.stringify(aBorrar, null, 2));
  console.log(`\n💾 Respaldo de los renglones a borrar: ${respaldo}`);

  const ids = aBorrar.map(r => r.id);
  let borrados = 0;
  for (let i = 0; i < ids.length; i += 200) {
    borrados += await knex('sales_history').whereIn('id', ids.slice(i, i + 200)).del();
  }

  console.log(`\n✅ Listo: ${borrados} renglones eliminados (${piezas} piezas duplicadas).`);
  console.log('   Revisa el perfil de algún doctor para confirmar que los totales cuadran.');

  await knex.destroy();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
