/**
 * Inspecciona el XML interno de un xlsx para ver cómo se almacenan los valores
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function inspect(filePath) {
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);
  
  // Buscar la hoja PEDIDO (sheet1.xml normalmente)
  const sheetFiles = Object.keys(zip.files).filter(f => f.includes('sheet'));
  console.log('Sheet files:', sheetFiles);
  
  // Leer sheet1.xml
  for (const sheetFile of sheetFiles) {
    if (!sheetFile.endsWith('.xml')) continue;
    const content = await zip.files[sheetFile].async('string');
    
    // Extraer solo las celdas A3-A10
    const cellRegex = /<c r="A(\d+)"[^>]*>.*?<\/c>/gs;
    let match;
    while ((match = cellRegex.exec(content)) !== null) {
      const rowNum = parseInt(match[1]);
      if (rowNum >= 3 && rowNum <= 10) {
        console.log(`\nCell A${rowNum}: ${match[0]}`);
      }
    }
    
    // También buscar el estilo de la columna A
    const colRegex = /<col[^>]*>/g;
    let colMatch;
    while ((colMatch = colRegex.exec(content)) !== null) {
      console.log('\nColumn def:', colMatch[0]);
    }
    
    break; // Solo primera hoja
  }
  
  // Buscar styles.xml para ver los formatos
  if (zip.files['xl/styles.xml']) {
    const styles = await zip.files['xl/styles.xml'].async('string');
    // Buscar numFmts
    const fmtRegex = /<numFmt[^>]*>/g;
    let fmtMatch;
    console.log('\n--- Number Formats ---');
    while ((fmtMatch = fmtRegex.exec(styles)) !== null) {
      console.log(fmtMatch[0]);
    }
  }
}

const testFile = path.join(__dirname, 'test_number_fix.xlsx');
if (fs.existsSync(testFile)) {
  inspect(testFile);
} else {
  console.log('File not found:', testFile);
}
