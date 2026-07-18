const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const data = fs.readFileSync('../Pedido_Semanal_20260514.xlsx');
  const zip = await JSZip.loadAsync(data);
  const files = Object.keys(zip.files).filter(f => f.includes('sheet') && f.endsWith('.xml'));
  
  for (const f of files) {
    const content = await zip.files[f].async('string');
    const idx = content.indexOf('r="A3"');
    if (idx > -1) {
      console.log('--- Celdas A3-A6 del archivo generado ---');
      console.log(content.substring(idx - 10, idx + 800));
    }
    break;
  }
}

run();
