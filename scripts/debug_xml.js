const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const data = fs.readFileSync('test_number_fix.xlsx');
  const zip = await JSZip.loadAsync(data);
  const files = Object.keys(zip.files).filter(f => f.includes('sheet') && f.endsWith('.xml'));
  
  for (const f of files) {
    const content = await zip.files[f].async('string');
    // Extract around row 3-6
    const idx = content.indexOf('r="A3"');
    if (idx > -1) {
      // Print 500 chars around it
      console.log(content.substring(idx - 50, idx + 500));
    }
    break;
  }

  // Also check the style 490 in styles.xml
  const styles = await zip.files['xl/styles.xml'].async('string');
  // Find xf entries
  const cellXfs = styles.substring(styles.indexOf('<cellXfs'), styles.indexOf('</cellXfs>') + 11);
  // Parse the xf entries and find index 490
  const xfRegex = /<xf [^>]+>/g;
  let match;
  let count = 0;
  while ((match = xfRegex.exec(cellXfs)) !== null) {
    if (count >= 488 && count <= 492) {
      console.log(`\nStyle ${count}: ${match[0]}`);
    }
    count++;
  }
  // Also check style 41
  const xfRegex2 = /<xf [^>]+>/g;
  let match2;
  let count2 = 0;
  while ((match2 = xfRegex2.exec(cellXfs)) !== null) {
    if (count2 >= 39 && count2 <= 43) {
      console.log(`\nStyle ${count2}: ${match2[0]}`);
    }
    count2++;
  }
}

run();
