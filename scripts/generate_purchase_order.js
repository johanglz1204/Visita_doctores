const XlsxPopulate = require('xlsx-populate');
const path = require('path');
const fs = require('fs');

/**
 * Genera un archivo de pedido basado en una plantilla Excel.
 * SOLO inyecta datos en las columnas especificadas, sin modificar NADA más:
 *   - Columna A  (1)  → Código del producto
 *   - Columna U  (21) → Pedido para MATRIZ
 *   - Columna AD (30) → Pedido para TAMPICO
 *   - Columna AM (39) → Pedido para EJERCITO
 *   - Columna AV (48) → Pedido para CURVA TEXAS
 *   - Columna BE (57) → Pedido para CIVIL
 * Los datos se insertan a partir de la fila 3 (filas 1-2 son encabezados).
 *
 * @param {Array} data - [{ "codigo": "750123", "MATRIZ": 15, "TAMPICO": 5, ... }]
 * @param {string} templatePath - Ruta al archivo .xlsx plantilla
 */

// Mapeo fijo de sucursal → columna (1-based)
const BRANCH_COLUMNS = {
    'MATRIZ':      21,  // Columna U
    'TAMPICO':     30,  // Columna AD
    'EJERCITO':    39,  // Columna AM
    'CURVA TEXAS': 48,  // Columna AV
    'CIVIL':       57   // Columna BE
};

async function generatePurchaseOrder(data, templatePath) {
    if (!fs.existsSync(templatePath)) {
        console.warn(`⚠️ Plantilla no encontrada: ${templatePath}`);
        return null;
    }

    console.log('💎 Abriendo plantilla con xlsx-populate...');
    const workbook = await XlsxPopulate.fromFileAsync(templatePath);
    
    const sheet = workbook.sheet('PEDIDO');
    if (!sheet) {
        console.error("❌ No se encontró la pestaña 'PEDIDO'.");
        return null;
    }

    console.log(`📍 Columnas fijas: A=Código, U=Matriz, AD=Tampico, AM=Ejercito, AV=Curva Texas, BE=Civil`);
    console.log(`📝 Insertando ${data.length} productos a partir de la fila 3...`);

    // --- INYECCIÓN DE DATOS (SOLO columnas A, U, AD, AM, AV, BE) ---
    let currentRow = 3;
    data.forEach((item, index) => {
        // Columna A (1) → Código
        sheet.cell(currentRow, 1).value(item.codigo);

        // Sucursales → Solo las columnas mapeadas
        for (const [branchName, colIndex] of Object.entries(BRANCH_COLUMNS)) {
            // Buscar la sucursal en el item (case-insensitive)
            const matchKey = Object.keys(item).find(k => k.toUpperCase() === branchName);
            if (matchKey) {
                const val = Number(item[matchKey]);
                if (!isNaN(val) && val !== 0) {
                    sheet.cell(currentRow, colIndex).value(val);
                }
            }
        }

        currentRow++;
        if ((index + 1) % 500 === 0) console.log(`   ✍️ Procesados ${index + 1}/${data.length}...`);
    });

    console.log(`   ✅ Total filas inyectadas: ${data.length}`);

    // --- GUARDADO ---
    const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const outputName = `Pedido_Estetico_Final_${fecha}.xlsx`;
    const outputPath = path.join(path.dirname(templatePath), outputName);

    console.log('💾 Guardando archivo final (Sin modificar nada más de la plantilla)...');
    await workbook.toFileAsync(outputPath);
    
    console.log(`✅ Pedido generado exitosamente: ${outputName}`);
    return outputPath;
}

module.exports = { generatePurchaseOrder };
