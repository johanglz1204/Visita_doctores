require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const { generatePurchaseOrder } = require('./generate_purchase_order');

const BRANCH_MAP = {
  1: 'MATRIZ',
  2: 'TAMPICO',
  6: 'CIVIL',
  13: 'EJERCITO',
  16: 'CURVA TEXAS'
};

const mysqlConfig = {
  host: process.env.MYSQL_HOST || '192.168.1.199',
  port: parseInt(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'visitadoc_reader',
  password: process.env.MYSQL_PASSWORD || 'VDReader2026!',
  database: process.env.MYSQL_DATABASE || 'dbsicofa',
  connectTimeout: 20000
};

async function generateOrder() {
  console.log('🔄 Iniciando cálculo de pedido multisucursal desde MySQL...');
  let connection;

  try {
    connection = await mysql.createConnection(mysqlConfig);
    console.log(`✅ Conectado al Servidor MySQL (${mysqlConfig.host}).`);

    // 1. Extraer stock y mínimos/máximos de las sucursales
    console.log('📦 Extrayendo inventario actual de todas las sucursales...');
    const [stockRows] = await connection.execute(`
      SELECT 
        stramecop AS barcode, 
        STRNOMBRE AS name, 
        INTEXISTENCIA AS stock, 
        STRRANKING AS ranking,
        STRSECTORID AS sector,
        INTMINIMO AS min_stock,
        INTMAXIMO AS max_stock_static,
        INTIDSUCURSAL AS sucursal_id
      FROM tblclsarticulo 
      WHERE INTIDSUCURSAL IN (1, 2, 6, 13, 16)
    `);

    // 2. Extraer ventas de los últimos 90 días
    console.log('📊 Calculando ventas de los últimos 90 días por sucursal...');
    const [salesRows] = await connection.execute(`
      SELECT 
        vdet.stramecop AS barcode,
        vdet.intidsucursal AS sucursal_id,
        SUM(vdet.intpzas) AS total_90d
      FROM tblclsdetventa vdet
      INNER JOIN tblclsventa v ON vdet.intidsucursal = v.intidsucursal AND vdet.intnumeroventa = v.intnumeroventa
      WHERE v.dtmfecha >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        AND v.intidsucursal IN (1, 2, 6, 13, 16)
        AND v.INTCLIENTEID NOT IN (80000, 100000, 99999, 100001, 75000)
      GROUP BY vdet.stramecop, vdet.intidsucursal
    `);

    console.log('🧮 Consolidando datos...');
    const productIndex = {};
    const SECTORES_EXCLUIDOS = [66, 55, 20, 97, 99];

    // Indexar stock
    for (const row of stockRows) {
      if (!row.barcode) continue;
      const barcode = row.barcode.trim();
      const branchName = BRANCH_MAP[row.sucursal_id];
      if (!branchName) continue;

      // Filtrar sectores prohibidos
      const sector = parseInt(row.sector) || 0;
      if (SECTORES_EXCLUIDOS.includes(sector)) continue;

      if (!productIndex[barcode]) {
        productIndex[barcode] = {
          barcode,
          name: row.name,
          stock_by_branch: {},
          sales_90d_by_branch: {},
          max_stock_by_branch: {},
          ranking_by_branch: {}
        };
      }
      
      productIndex[barcode].stock_by_branch[branchName] = parseInt(row.stock) || 0;
      productIndex[barcode].ranking_by_branch[branchName] = (row.ranking || '').toUpperCase();

      // Lógica de cálculo de stock ideal (15 días)
      // Si es AA, A, B o C, el mínimo es 1. Si no, es 0 a menos que tenga ventas.
      const ranking = (row.ranking || '').toUpperCase();
      let targetVal = 0;
      if (['AA', 'A', 'B', 'C'].includes(ranking)) {
        targetVal = 1; // Presencia mínima
      }
      productIndex[barcode].max_stock_by_branch[branchName] = targetVal;
    }

    // Indexar ventas y ajustar target15d
    for (const row of salesRows) {
      if (!row.barcode) continue;
      const barcode = row.barcode.trim();
      const branchName = BRANCH_MAP[row.sucursal_id];
      if (!branchName) continue;

      if (productIndex[barcode]) {
        const sales90d = parseInt(row.total_90d) || 0;
        productIndex[barcode].sales_90d_by_branch[branchName] = sales90d;
        
        // Ajustar target basado en ventas (15 días = 1/6 de 90 días)
        const targetSales = Math.ceil(sales90d / 6);
        const currentTarget = productIndex[barcode].max_stock_by_branch[branchName] || 0;
        productIndex[barcode].max_stock_by_branch[branchName] = Math.max(currentTarget, targetSales);
      }
    }

    // 3. Lógica de Pedido / Reacomodo
    console.log('⚙️ Evaluando faltantes y excedentes...');
    const orderData = [];

    for (const barcode in productIndex) {
      const prod = productIndex[barcode];
      const orderItem = { codigo: barcode };
      let hasMovement = false;

      for (const suc of Object.values(BRANCH_MAP)) {
        const currentStock = prod.stock_by_branch[suc] || 0;
        const sales90d = prod.sales_90d_by_branch[suc] || 0;
        const target15d = prod.max_stock_by_branch[suc] || 0; // Objetivo dinámico
        const safety30d = Math.ceil(sales90d / 3);            // Reserva de seguridad (30 días de venta)

        let val = 0;
        if (currentStock < target15d) {
          // Faltante -> Pedido Positivo
          val = target15d - currentStock;
        } else if (currentStock > safety30d && safety30d > 0) {
          // Excedente -> Reacomodo Negativo
          val = safety30d - currentStock;
        }

        if (val !== 0) {
          orderItem[suc] = val;
          hasMovement = true;
        }
      }

      const allRankings = Object.values(prod.ranking_by_branch);
      const isReviewRequired = allRankings.some(r => r === 'C' || r === 'E');

      if (hasMovement || isReviewRequired) {
        orderData.push(orderItem);
      }
    }

    console.log(`\n📦 Generando propuesta de pedido para ${orderData.length} líneas...`);
    
    // Llamar directamente a xlsx-populate con la plantilla de 24MB
    const templatePath = path.join(__dirname, '..', 'FORMATO PEDIDO ABARROTES-PATENTE.xlsx');
    
    // Si no hay datos, crear un archivo vacío solo para cumplir la petición
    if (orderData.length === 0) {
      console.log('ℹ️ No hay productos para pedir o reacomodar.');
      orderData.push({ codigo: 'N/A' });
    }

    // Esto consumirá bastante RAM, por eso lanzamos Node con --max-old-space-size=4096
    const outputPath = await generatePurchaseOrder(orderData, templatePath);
    
    if (outputPath) {
      console.log(`✅ EXITO`);
    }

  } catch (err) {
    console.error('❌ Error en generateOrder:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
    // Forzamos salida explícita para que el proceso devuelva exit code 0 y libere memoria
    process.exit(0);
  }
}

generateOrder();
