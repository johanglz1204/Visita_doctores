/**
 * Inspección profunda: compara la plantilla original vs el archivo generado
 * para entender exactamente qué hace xlsx-populate con las celdas.
 */
const fs = require('fs');
const JSZip = require('jszip');

async function inspectFile(label, filePath) {
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);
  
  // Encontrar la hoja PEDIDO
  const sheetFiles = Object.keys(zip.files).filter(f => 
    f.startsWith('xl/worksheets/') && f.endsWith('.xml')
  );
  
  // Necesitamos el workbook.xml para mapear nombre de hoja -> archivo
  const wbXml = await zip.files['xl/workbook.xml'].async('string');
  
  console.log(`\n=== ${label} ===`);
  
  for (const sf of sheetFiles) {
    const content = await zip.files[sf].async('string');
    if (!content.includes('CATALOGO GENERAL')) continue; // Esta es la hoja PEDIDO
    
    console.log(`Hoja: ${sf}`);
    
    // Extraer celdas A3-A6 completas
    for (let row = 3; row <= 8; row++) {
      const pattern = `r="A${row}"`;
      const idx = content.indexOf(pattern);
      if (idx === -1) {
        console.log(`  A${row}: NO ENCONTRADA`);
        continue;
      }
      
      // Encontrar el inicio del tag <c
      let start = idx;
      while (start > 0 && content[start] !== '<') start--;
      
      // Encontrar el final
      let end = content.indexOf('</c>', idx);
      if (end === -1) {
        // Self-closing tag
        end = content.indexOf('/>', idx) + 2;
      } else {
        end += 4;
      }
      
      const cellXml = content.substring(start, end);
      console.log(`  A${row}: ${cellXml}`);
      
      // Analizar atributos
      const hasTypeS = cellXml.includes('t="s"');
      const hasTypeStr = cellXml.includes('t="str"');
      const hasTypeN = cellXml.includes('t="n"');
      const styleMatch = cellXml.match(/s="(\d+)"/);
      const valueMatch = cellXml.match(/<v>([^<]*)<\/v>/);
      
      console.log(`    tipo-s=${hasTypeS}, tipo-str=${hasTypeStr}, tipo-n=${hasTypeN}`);
      console.log(`    estilo=${styleMatch?.[1]}, valor=${valueMatch?.[1] || 'VACÍO'}`);
    }
    
    break;
  }
  
  // Revisar sharedStrings para ver si los números están ahí
  if (zip.files['xl/sharedStrings.xml']) {
    const ss = await zip.files['xl/sharedStrings.xml'].async('string');
    // Buscar strings que sean solo números
    const siRegex = /<si><t[^>]*>(\d+)<\/t><\/si>/g;
    let match;
    const numericStrings = [];
    let idx = 0;
    while ((match = siRegex.exec(ss)) !== null) {
      if (parseInt(match[1]) < 200) { // Solo los que podrían ser códigos pequeños
        numericStrings.push({ index: idx, value: match[1] });
      }
      idx++;
    }
    if (numericStrings.length > 0) {
      console.log(`\n  SharedStrings con valores numéricos pequeños:`);
      numericStrings.slice(0, 10).forEach(s => {
        console.log(`    Índice ${s.index}: "${s.value}"`);
      });
    }
  }
}

async function run() {
  const generated = '../Pedido_Semanal_20260514.xlsx';
  if (fs.existsSync(generated)) {
    await inspectFile('ARCHIVO GENERADO (20260514)', generated);
  }
  
  const generated2 = '../Pedido_Semanal_20260513.xlsx';
  if (fs.existsSync(generated2)) {
    await inspectFile('ARCHIVO GENERADO (20260513)', generated2);
  }
  
  await inspectFile('PLANTILLA ORIGINAL', '../FORMATO PEDIDO ABARROTES-PATENTE.xlsx');
}

run().catch(console.error);
