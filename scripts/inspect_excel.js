const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'productos en sistema.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Get first 5 rows to see structure
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 0 });
console.log('Headers and sample data:');
console.log(JSON.stringify(data.slice(0, 5), null, 2));
