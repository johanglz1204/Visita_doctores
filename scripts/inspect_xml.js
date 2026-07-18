const fs = require('fs');
const JSZip = require('jszip');

async function run() {
    const data = fs.readFileSync('../test_populate_general.xlsx');
    const zip = await JSZip.loadAsync(data);
    const sheet = await zip.files['xl/worksheets/sheet4.xml'].async('string');
    console.log("CELL:", sheet.substring(sheet.indexOf('<c r="A3"'), sheet.indexOf('<c r="A3"') + 150));
    
    const styles = await zip.files['xl/styles.xml'].async('string');
    const cellXfsMatch = styles.match(/<cellXfs count="(\d+)">/);
    console.log('cellXfs count:', cellXfsMatch ? cellXfsMatch[1] : 'not found');
}
run();
