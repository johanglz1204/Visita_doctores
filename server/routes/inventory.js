const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const db = require('../db');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `inv-${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de Excel (.xlsx, .xls)'), false);
    }
  },
});

// GET /api/inventory - List all stock assignments with doctor and product names
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        i.id,
        i.doctor_id,
        d.name AS doctor_name,
        i.product_id,
        p.name AS product_name,
        i.target_stock,
        i.current_stock,
        i.created_at,
        i.updated_at
      FROM inventory_stocks i
      JOIN doctors d ON i.doctor_id = d.id
      JOIN products p ON i.product_id = p.id
      ORDER BY d.name ASC, p.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching inventory:', err);
    res.status(500).json({ error: 'Error al obtener inventario' });
  }
});

// GET /api/inventory/critical - Get critical stock entries (current_stock <= 20% of target or <= 2)
router.get('/critical', async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 2;
    const { rows } = await db.query(`
      SELECT 
        i.id,
        i.doctor_id,
        d.name AS doctor_name,
        d.phone AS doctor_phone,
        i.product_id,
        p.name AS product_name,
        i.target_stock,
        i.current_stock,
        CASE 
          WHEN i.target_stock > 0 THEN ROUND((i.current_stock::numeric / i.target_stock) * 100)
          ELSE 0 
        END AS stock_percentage
      FROM inventory_stocks i
      JOIN doctors d ON i.doctor_id = d.id
      JOIN products p ON i.product_id = p.id
      WHERE i.current_stock <= $1 
         OR (i.target_stock > 0 AND (i.current_stock::numeric / i.target_stock) <= 0.2)
      ORDER BY i.current_stock ASC
    `, [threshold]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching critical stock:', err);
    res.status(500).json({ error: 'Error al obtener stock crítico' });
  }
});

// POST /api/inventory - Assign stock to doctor+product
router.post('/', async (req, res) => {
  try {
    const { doctor_id, product_id, target_stock, current_stock } = req.body;
    const { rows } = await db.query(
      `INSERT INTO inventory_stocks (doctor_id, product_id, target_stock, current_stock)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (doctor_id, product_id) 
       DO UPDATE SET target_stock = $3, current_stock = $4, updated_at = NOW()
       RETURNING *`,
      [doctor_id, product_id, target_stock || 0, current_stock || target_stock || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating inventory entry:', err);
    res.status(500).json({ error: 'Error al crear entrada de inventario' });
  }
});

// POST /api/inventory/upload-excel - Upload Excel and update inventory
router.post('/upload-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó archivo' });
    }

    const workbook = xlsx.readFile(req.file.path);
    const results = { processed: 0, errors: [] };

    // Function to normalize strings by removing accents
    const normalize = (str) => {
      if (!str) return '';
      return str.toString().trim()
        .toLowerCase()
        .normalize('NFD') // Split base char and accents
        .replace(/[\u0300-\u036f]/g, ''); // Remove accents
    };

    // Find the right sheet (look for one that has 'Producto' or 'Nombre')
    let data = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const testData = xlsx.utils.sheet_to_json(sheet);
      if (testData.length > 0) {
        const firstRow = testData[0];
        const hasProductCol = Object.keys(firstRow).some(k => 
          ['producto', 'nombre', 'product', 'name'].includes(normalize(k))
        );
        if (hasProductCol) {
          data = testData;
          console.log(`[INVENTORY EXCEL UPLOAD] Correct sheet found: ${sheetName} (${data.length} rows)`);
          break;
        }
      }
    }

    if (data.length === 0) {
      data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      console.log(`[INVENTORY EXCEL UPLOAD] Falling back to first sheet`);
    }

    for (const row of data) {
      const findValue = (row, names) => {
        const normalizedNames = names.map(n => normalize(n));
        const key = Object.keys(row).find(k => 
          normalizedNames.includes(normalize(k))
        );
        return key ? row[key] : undefined;
      };

      const doctorName = findValue(row, ['Doctor', 'Médico', 'Medico', 'Doc', 'Name']);
      const productName = findValue(row, ['Producto', 'Nombre', 'Product', 'Name']);
      const productCode = findValue(row, ['Código', 'Codigo', 'SKU', 'ID', 'stramecop', 'Code']);
      const targetStock = parseInt(findValue(row, ['Stock Objetivo', 'Objetivo', 'Meta', 'Target', 'STOCK', 'Stock']) || 0);
      const currentStock = parseInt(findValue(row, ['Existencias', 'Stock Actual', 'Actual', 'Current', 'Existencia Cadena', 'Existencia']) || 0);

      if (!doctorName || !productName) {
        const rowKeys = Object.keys(row).join(', ');
        results.errors.push(`Fila ${results.processed + results.errors.length + 1}: Faltan 'Doctor' o 'Producto'. Columnas: [${rowKeys}]`);
        continue;
      }

      try {
        // Find or create doctor
        let doctorId;
        const { rows: docRows } = await db.query('SELECT id FROM doctors WHERE UPPER(trim(name)) = $1', [doctorName.toString().trim().toUpperCase()]);
        if (docRows.length > 0) {
          doctorId = docRows[0].id;
        } else {
          const { rows: newDoc } = await db.query('INSERT INTO doctors (name) VALUES ($1) RETURNING id', [doctorName.toString().trim()]);
          doctorId = newDoc[0].id;
        }

        // Find or create product (first try by code if available, then by name)
        let productId;
        let existingProduct = null;

        if (productCode) {
          const { rows: codeRows } = await db.query('SELECT id FROM products WHERE code = $1', [productCode.toString().trim()]);
          if (codeRows.length > 0) existingProduct = codeRows[0];
        }

        if (!existingProduct) {
          const { rows: nameRows } = await db.query('SELECT id FROM products WHERE UPPER(trim(name)) = $1', [productName.toString().trim().toUpperCase()]);
          if (nameRows.length > 0) {
            existingProduct = nameRows[0];
            // Update code if it was missing
            if (productCode) {
              await db.query('UPDATE products SET code = $1 WHERE id = $2', [productCode.toString().trim(), existingProduct.id]);
            }
          }
        }

        if (existingProduct) {
          productId = existingProduct.id;
        } else {
          const { rows: newProd } = await db.query('INSERT INTO products (name, code) VALUES ($1, $2) RETURNING id', [productName.toString().trim(), productCode ? productCode.toString().trim() : null]);
          productId = newProd[0].id;
        }

        // Upsert inventory
        await db.query(
          `INSERT INTO inventory_stocks (doctor_id, product_id, target_stock, current_stock)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (doctor_id, product_id) 
           DO UPDATE SET target_stock = $3, current_stock = $4, updated_at = NOW()`,
          [doctorId, productId, targetStock, currentStock]
        );
        results.processed++;
      } catch (err) {
        results.errors.push(`Error en (${doctorName} - ${productName}): ${err.message}`);
      }
    }

    fs.unlinkSync(req.file.path);
    
    let finalMessage = `Se procesaron ${results.processed} registros de inventario.`;
    if (results.errors.length > 0) {
      finalMessage += ` (${results.errors.length} filas omitidas/fallidas)`;
    }
    
    res.json({ message: finalMessage, results });
  } catch (err) {
    console.error('Error processing inventory Excel:', err);
    res.status(500).json({ error: 'Error al procesar archivo de Excel' });
  }
});

// PUT /api/inventory/:id - Update stock assignment
router.put('/:id', async (req, res) => {
  try {
    const { target_stock, current_stock } = req.body;
    const { rows } = await db.query(
      `UPDATE inventory_stocks SET target_stock=$1, current_stock=$2, updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [target_stock, current_stock, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Entrada no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating inventory:', err);
    res.status(500).json({ error: 'Error al actualizar inventario' });
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM inventory_stocks WHERE id=$1 RETURNING *', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Entrada no encontrada' });
    res.json({ message: 'Entrada eliminada' });
  } catch (err) {
    console.error('Error deleting inventory:', err);
    res.status(500).json({ error: 'Error al eliminar entrada' });
  }
});

module.exports = router;
