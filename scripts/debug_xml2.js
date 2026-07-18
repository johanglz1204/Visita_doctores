const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const data = fs.readFileSync('test_number_fix.xlsx');
  const zip = await JSZip.loadAsync(data);
  
  const styles = await zip.files['xl/styles.xml'].async('string');
  const cellXfs = styles.substring(styles.indexOf('<cellXfs'), styles.indexOf('</cellXfs>') + 11);
  const xfRegex = /<xf [^>]+>/g;
  let match;
  let count = 0;
  while ((match = xfRegex.exec(cellXfs)) !== null) {
    if (count >= 511 && count <= 515) {
      console.log(`Style ${count}: ${match[0]}`);
    }
    count++;
  }
  console.log('Total styles:', count);

  // Also check the ORIGINAL template
  const origData = fs.readFileSync('../FORMATO PEDIDO ABARROTES-PATENTE.xlsx');
  const origZip = await JSZip.loadAsync(origData);
  const origFiles = Object.keys(origZip.files).filter(f => f.includes('sheet') && f.endsWith('.xml'));
  for (const f of origFiles) {
    const content = await origZip.files[f].async('string');
    const idx = content.indexOf('r="A3"');
    if (idx > -1) {
      console.log('\n--- ORIGINAL TEMPLATE A3 ---');
      console.log(content.substring(idx - 10, idx + 150));
      break;
    }
  }
}

run();
