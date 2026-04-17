const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const db = require('../db');
const { z } = require('zod');
const { validateRequest } = require('../middlewares/validate');
const { normalize, hardClean, cleanForDisplay } = require('../utils/stringUtils');

const productSchema = z.object({
  body: z.object({
    name: z.string().min(2, "El nombre del producto debe tener al menos 2 caracteres"),
    barcode: z.string().optional(),
    ranking: z.string().optional(),
    price: z.number().nonnegative("El precio no puede ser negativo").optional().or(z.string().transform(v => parseFloat(v) || 0))
  })
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `prods-${Date.now()}-${file.originalname}`);
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

// GET /api/products - List all products
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM products ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// GET /api/products/export-excel - Export products to Excel (MUST BE ABOVE :id)
router.get('/export-excel', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT name, barcode, ranking, price FROM products ORDER BY name ASC');
    
    // Map data to pretty headers
    const data = rows.map(r => ({
      'Producto': r.name,
      'Código de Barras': r.barcode || '',
      'Ranking': r.ranking || '',
      'Precio Vale': parseFloat(r.price) || 0
    }));

    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Productos');
    
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Productos.xlsx');
    res.send(buffer);
  } catch (err) {
    console.error('Error exporting products:', err);
    res.status(500).json({ error: 'Error al exportar productos' });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ error: 'Error al obtener producto' });
  }
});

// POST /api/products - Create product
router.post('/', validateRequest(productSchema), async (req, res) => {
  try {
    const { name, barcode, ranking, price } = req.body;
    
    // Check for duplicates (Normalized)
    const cleanedName = cleanForDisplay(name);
    const { rows: existing } = await db.query(
      'SELECT id FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) OR (barcode IS NOT NULL AND barcode = $2 AND barcode <> \'\')',
      [cleanedName, barcode || '---MISSING---']
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Ya existe un producto con ese nombre o código de barras' });
    }

    const { rows } = await db.query(
      `INSERT INTO products (name, barcode, ranking, price)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [cleanedName, barcode || '', ranking || '', price || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// POST /api/products/upload-excel - Upload Excel and update products
router.post('/upload-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó archivo' });
    }

    const workbook = xlsx.readFile(req.file.path);
    const results = { processed: 0, errors: [] };

    // Function to normalize strings by removing accents
    const normalizeLocal = (str) => normalize(str);

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
          console.log(`[PRODUCT EXCEL UPLOAD] Correct sheet found: ${sheetName} (${data.length} rows)`);
          break;
        }
      }
    }

    if (data.length === 0) {
      data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      console.log(`[PRODUCT EXCEL UPLOAD] No sheet with product column found, falling back to first sheet: ${workbook.SheetNames[0]}`);
    }

    if (data.length > 0) {
      console.log(`[PRODUCT EXCEL UPLOAD] Columns found: ${Object.keys(data[0]).join(', ')}`);
    } else {
      console.log(`[PRODUCT EXCEL UPLOAD] Empty file or sheet`);
      results.errors.push('El archivo de Excel parece estar vacío o no contiene hojas válidas.');
    }

    for (const row of data) {
      const findValue = (row, names) => {
        const normalizedNames = names.map(n => normalizeLocal(n));
        const key = Object.keys(row).find(k => 
          normalizedNames.includes(normalizeLocal(k))
        );
        return key ? row[key] : undefined;
      };

      const name = findValue(row, ['NOMBRE/DESCRIPCION', 'Nombre', 'Producto', 'Product', 'Name', 'Descripción', 'Descripcion']);
      const barcode = findValue(row, ['CODIGO DE BARRAS', 'Barcode', 'Código', 'Codigo', 'UPC', 'EAN', 'Código de Barras']) || '';
      const ranking = findValue(row, ['RANKING', 'Ranking', 'Nivel', 'Categoría', 'Categoria']) || '';
      const rawPrice = findValue(row, ['PRECIO VALE', 'Precio', 'Price', 'Cost', 'Coste', 'Costo', 'Importe', 'Precio Vale']) || 0;

      console.log(`[ROW] Name: ${name}, Barcode: ${barcode}, Ranking: ${ranking}, Price: ${rawPrice}`);

      let price = 0;
      if (typeof rawPrice === 'string' && rawPrice) {
        const cleaned = rawPrice.replace(/[$,\s]/g, '');
        price = parseFloat(cleaned) || 0;
      } else {
        price = parseFloat(rawPrice) || 0;
      }

      if (!name) {
        const rowKeys = Object.keys(row).join(', ');
        results.errors.push(`Fila ${results.processed + results.errors.length + 1}: No se detectó 'Nombre' o 'Producto'. Columnas: [${rowKeys}]`);
        continue;
      }

      try {
        const cleanedName = cleanForDisplay(name);

        const { rows: existing } = await db.query(
          'SELECT id FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) OR (barcode IS NOT NULL AND barcode = $2 AND barcode <> \'\')',
          [cleanedName, barcode.toString().trim()]
        );

        if (existing.length > 0) {
          // Si hay múltiples, actualizamos el primero (el cleanup los unirá después)
          await db.query(
            `UPDATE products SET 
               barcode=$1, 
               ranking=$2, 
               price=$3, 
               updated_at=NOW() 
             WHERE id=$4`,
            [barcode.toString(), ranking.toString(), price, existing[0].id]
          );
          // Y nos aseguramos que los otros (si hay duplicados) al menos tengan el mismo ranking
          if (existing.length > 1) {
            await db.query(
              'UPDATE products SET ranking=$1, name=$2 WHERE LOWER(TRIM(name)) = LOWER(TRIM($3))',
              [ranking.toString(), cleanedName, name.toString()]
            );
          }
        } else {
          await db.query(
            `INSERT INTO products (name, barcode, ranking, price) 
             VALUES ($1, $2, $3, $4)`,
            [cleanedName, barcode.toString().trim(), ranking.toString(), price]
          );
        }
        results.processed++;
      } catch (err) {
        console.error(`[ERROR ROW] ${name}:`, err.message);
        results.errors.push(`Error en producto ${name}: ${err.message}`);
      }
    }

    fs.unlinkSync(req.file.path);
    
    let finalMessage = `Se procesaron ${results.processed} productos exitosamente.`;
    if (results.errors.length > 0) {
      finalMessage += ` (${results.errors.length} filas fallidas)`;
    }
    
    res.json({ message: finalMessage, results });
  } catch (err) {
    console.error('Error processing products Excel:', err);
    res.status(500).json({ error: 'Error al procesar archivo de Excel' });
  }
});

// PUT /api/products/:id - Update product
router.put('/:id', validateRequest(productSchema), async (req, res) => {
  try {
    const { name, barcode, ranking, price } = req.body;
    const { rows } = await db.query(
      `UPDATE products SET name=$1, barcode=$2, ranking=$3, price=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [name.trim(), barcode || '', ranking || '', price || 0, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM products WHERE id=$1 RETURNING *', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ message: 'Producto eliminado', product: rows[0] });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

module.exports = router;
