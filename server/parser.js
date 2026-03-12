/**
 * Parser for Medical Tickets (Farmalike / Farmapram style).
 * 
 * Extracts: Doctor, Products, Quantities, Date
 */

const IGNORE_PATTERNS = [
  /ESTE TICKET NO ES FISCAL/i,
  /I M P O R T A N T E/i,
  /GRACIAS POR SU COMPRA/i,
  /VISITENOS EN FACEBOOK/i,
  /FARMACEUTICA ESPECIALIZADA/i,
  /REGIMEN GENERAL DE LEY/i,
  /SUCURSAL:/i,
  /DIRECCION:/i,
  /ZONA CENTRO/i,
  /RFC:/i,
  /CONSULTE NUESTRO AVISO/i,
  /SUBTOTAL/i,
  /IVA/i,
  /IEPS/i,
  /TOTAL/i,
  /\(\w+\s+pesos/i,
  /T.PAGO/i,
  /EFECTIVO/i,
  /CAMBIO/i,
  /CANTIDAD/i,
  /====================/
];

function parseTicket(text) {
  const results = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  let currentDoctor = null;
  let currentDate = null;
  let currentProduct = null;
  let currentPresentation = null;
  let inProductTable = false;

  for (const line of lines) {
    // 1. Skip boilerplate
    if (IGNORE_PATTERNS.some(p => p.test(line))) {
      if (line.match(/SUBTOTAL/i) || line.match(/TOTAL/i)) inProductTable = false;
      continue;
    }

    // 2. Match Doctor
    // Format "Cliente: DR ..."
    const clienteMatch = line.match(/Cliente:\s+(DRA?\.?\s+[A-ZÁÉÍÓÚÑa-záéíóúñ\s\.]+)/i);
    if (clienteMatch) {
      currentDoctor = clienteMatch[1].trim().toUpperCase();
      continue;
    }
    // Generic "DR ..." at start of line
    const drMatch = line.match(/^(DRA?\.?\s+[A-ZÁÉÍÓÚÑa-záéíóúñ\s\.]+)/i);
    if (drMatch && !currentDoctor) {
      currentDoctor = drMatch[1].trim().toUpperCase();
      continue;
    }

    // 3. Match Date
    const dateMatch = line.match(/Fecha:\s*(\d{4}-\d{2}-\d{2})/i);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }

    // 4. Match Table Header
    if (line.match(/Nombre\s+Pzas?\./i)) {
      inProductTable = true;
      continue;
    }

    // 5. Match Product Lines
    
    // CASE A: Table line "5412 FARMAPRAM 0.50 MG T 1 $298.00"
    // Regex: (Name) (Dosage) (garbage) (Qty) (Price)
    const tableLineMatch = line.match(/^(?:\d+\s+)?([A-ZÁÉÍÓÚÑ\s\-]+?)\s+(\d+\.?\d*\s*(?:MG|ML|GR|G|MCG|UI))?.*?\s+(\d+)\s+\$/i);
    if (tableLineMatch) {
      results.push({
        doctor: currentDoctor,
        product: tableLineMatch[1].trim().toUpperCase(),
        presentation: tableLineMatch[2] ? tableLineMatch[2].trim().toUpperCase() : '',
        quantity: parseInt(tableLineMatch[3], 10),
        date: currentDate || new Date().toISOString().split('T')[0],
        rawText: line
      });
      continue;
    }

    // CASE B: Standard line "FARMAPRAM 0.50 MG 1 Pza"
    const simpleLineMatch = line.match(/^([A-ZÁÉÍÓÚÑ\s\-]+?)\s+(\d+\.?\d*\s*(?:MG|ML|GR|G|MCG|UI))?\s+(\d+)\s*(?:Pzas?|PZA)/i);
    if (simpleLineMatch) {
      results.push({
        doctor: currentDoctor,
        product: simpleLineMatch[1].trim().toUpperCase(),
        presentation: simpleLineMatch[2] ? simpleLineMatch[2].trim().toUpperCase() : '',
        quantity: parseInt(simpleLineMatch[3], 10),
        date: currentDate || new Date().toISOString().split('T')[0],
        rawText: line
      });
      continue;
    }

    // CASE C: Multi-line detection
    // Subcase 1: Just Product + Dosage
    const productOnlyMatch = line.match(/^([A-ZÁÉÍÓÚÑ\s\-]+?)\s+(\d+\.?\d*\s*(?:MG|ML|GR|G|MCG|UI))?$/i);
    if (productOnlyMatch && !inProductTable) {
      currentProduct = productOnlyMatch[1].trim().toUpperCase();
      currentPresentation = productOnlyMatch[2] ? productOnlyMatch[2].trim().toUpperCase() : '';
      continue;
    }

    // Subcase 2: Just Quantity "1 Pza"
    const qtyOnlyMatch = line.match(/^(\d+)\s*(?:Pzas?|PZA|piezas?)/i);
    if (qtyOnlyMatch && currentProduct) {
      results.push({
        doctor: currentDoctor,
        product: currentProduct,
        presentation: currentPresentation || '',
        quantity: parseInt(qtyOnlyMatch[1], 10),
        date: currentDate || new Date().toISOString().split('T')[0],
        rawText: `${currentProduct} ${currentPresentation} | ${line}`
      });
      // Don't reset currentProduct yet? (Maybe multiple same items?)
      // Actually, resetting is safer for mismatched files.
      currentProduct = null;
      currentPresentation = null;
      continue;
    }
  }

  return results;
}

module.exports = { parseTicket };
