/**
 * Parser unit test
 * Run: node server/parser.test.js
 */

const { parseTicket } = require('./parser');

const farmalikeTicket = `
FARMACEUTICA ESPECIALIZADA FARMALIKE SA DE CV
Regimen general de ley personas morales
SUCURSAL: MATRIZ
DIRECCION: BOLIVIA No 202 A PTE
ZONA CENTRO, C.P.:89400
RFC: FEF210202EL5  Tel.:8332214800
Venta: 2 - 591638
Fecha: 2026-03-11 12:54:06
Empleado: MARTHA FABIAN SAM
Cliente: DR ADOLFO MTZ TAPIA

Nombre                   Pzas.    Importe
-----------------------------------------
 5412 FARMAPRAM 0.50 MG T    1    $298.00
                               ----------
      SUBTOTAL                    $298.00
      IVA                           $0.00
      IEPS                          $0.00
      TOTAL                       $298.00


(Doscientos Noventa y Ocho Pesos 00/100 M.N.)
T.Pago          Cambio         Cantidad
Efectivo         $202.00          $500.00
=========================================
  GRACIAS POR SU COMPRA, REGRESE PRONTO! 
  
  Visitenos en FACEBOOK para consultar
  nuestras promociones FARMALIKEOFICIAL

          ESTE TICKET NO ES FISCAL

   *****I M P O R T A N T E *****
  ESTE TICKET SOLO PODRA SER FACTURADO
  UNICAMENTE DENTRO DEL DIA DE COMPRA
 
  Consulte nuestro aviso de privacidad en
        http://www.farmalike.com.mx
`;

const sampleFarmapram = `
DR ADOLFO MTZ TAPIA
FARMAPRAM 0.50 MG
1 Pza
2026-03-11
`;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// Test 1: Farmalike Format
console.log('\n--- Test 1: Farmalike Ticket ---');
const res1 = parseTicket(farmalikeTicket);
assert(res1.length === 1, `Should parse 1 record, got ${res1.length}`);
if (res1[0]) {
    assert(res1[0].doctor === 'DR ADOLFO MTZ TAPIA', `Doctor = "${res1[0].doctor}"`);
    assert(res1[0].product === 'FARMAPRAM', `Product = "${res1[0].product}"`);
    assert(res1[0].presentation === '0.50 MG', `Presentation = "${res1[0].presentation}"`);
    assert(res1[0].quantity === 1, `Quantity = ${res1[0].quantity}`);
    assert(res1[0].date === '2026-03-11', `Date = "${res1[0].date}"`);
}

// Test 2: Standard Format
console.log('\n--- Test 2: Standard Ticket ---');
const res2 = parseTicket(sampleFarmapram);
assert(res2.length === 1, `Should parse 1 record, got ${res2.length}`);
if (res2[0]) {
    assert(res2[0].doctor === 'DR ADOLFO MTZ TAPIA', `Doctor = "${res2[0].doctor}"`);
    assert(res2[0].product === 'FARMAPRAM', `Product = "${res2[0].product}"`);
}

// Test 3: Multiple Products (Simulated)
console.log('\n--- Test 3: Multiple Products ---');
const multiTicket = farmalikeTicket.replace(
    '5412 FARMAPRAM 0.50 MG T    1    $298.00',
    '5412 FARMAPRAM 0.50 MG T    1    $298.00\n 5413 FARMAPRAM 1.00 MG T    2    $596.00'
);
const res3 = parseTicket(multiTicket);
assert(res3.length === 2, `Should parse 2 records, got ${res3.length}`);
if (res3[1]) {
    assert(res3[1].product === 'FARMAPRAM', `Product 2 = "${res3[1].product}"`);
    assert(res3[1].presentation === '1.00 MG', `Presentation 2 = "${res3[1].presentation}"`);
    assert(res3[1].quantity === 2, `Quantity 2 = ${res3[1].quantity}`);
}

console.log('\n--- All tests complete ---\n');
