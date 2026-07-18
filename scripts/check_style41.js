const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const data = fs.readFileSync('../Pedido_Semanal_20260514.xlsx');
  const zip = await JSZip.loadAsync(data);
  const styles = await zip.files['xl/styles.xml'].async('string');
  
  // Extraer la sección cellXfs
  const cellXfsStart = styles.indexOf('<cellXfs');
  const cellXfsEnd = styles.indexOf('</cellXfs>') + 11;
  const cellXfs = styles.substring(cellXfsStart, cellXfsEnd);
  
  // Encontrar el estilo 41 (0-indexed)
  const xfRegex = /<xf [^>]+\/?>/g;
  let match;
  let count = 0;
  while ((match = xfRegex.exec(cellXfs)) !== null) {
    if (count === 41) {
      console.log(`Estilo 41: ${match[0]}`);
      
      // Extraer numFmtId
      const fmtMatch = match[0].match(/numFmtId="(\d+)"/);
      if (fmtMatch) {
        const fmtId = parseInt(fmtMatch[1]);
        console.log(`numFmtId: ${fmtId}`);
        
        // Built-in formats: 0=General, 1=0, 49=@(Text)
        if (fmtId === 0) console.log('Formato: General');
        else if (fmtId === 1) console.log('Formato: 0 (Entero)');
        else if (fmtId === 49) console.log('Formato: @ (TEXTO!) <-- PROBLEMA');
        else console.log(`Formato personalizado id=${fmtId}`);
      }
    }
    if (count === 490) {
      console.log(`\nEstilo 490 (columna): ${match[0]}`);
      const fmtMatch = match[0].match(/numFmtId="(\d+)"/);
      if (fmtMatch) {
        const fmtId = parseInt(fmtMatch[1]);
        if (fmtId === 49) console.log('Formato: @ (TEXTO!) <-- PROBLEMA');
        else console.log(`numFmtId: ${fmtId}`);
      }
    }
    count++;
  }
  
  // Ahora buscar el numFmt para id=1
  const numFmts = styles.substring(styles.indexOf('<numFmts'), styles.indexOf('</numFmts>') + 11);
  console.log('\n--- Formatos de número personalizados ---');
  const nfRegex = /<numFmt[^>]+>/g;
  let nfMatch;
  while ((nfMatch = nfRegex.exec(numFmts)) !== null) {
    const idMatch = nfMatch[0].match(/numFmtId="(\d+)"/);
    if (idMatch && parseInt(idMatch[1]) <= 50) {
      console.log(nfMatch[0]);
    }
  }
  
  // Verificar: ¿el numFmtId 1 fue redefinido como @ ?
  console.log('\n--- Buscar si numFmtId=1 fue redefinido ---');
  if (numFmts.includes('numFmtId="1"')) {
    const idx = numFmts.indexOf('numFmtId="1"');
    console.log('ENCONTRADO:', numFmts.substring(idx - 20, idx + 80));
  } else {
    console.log('numFmtId=1 usa el formato built-in: "0" (entero)');
  }
}

run();
