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
router.post('/', async (req, res) => {
  try {
    const { name, presentation, laboratory, description, barcode, ranking, price } = req.body;
    
    // Check for duplicates
    const { rows: existing } = await db.query(
      'SELECT id FROM products WHERE UPPER(name) = $1 AND UPPER(presentation) = $2',
      [name.toUpperCase(), (presentation || '').toUpperCase()]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Ya existe un producto con ese nombre y presentación' });
    }

    const { rows } = await db.query(
      `INSERT INTO products (name, presentation, laboratory, description, barcode, ranking, price)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, presentation || '', laboratory || '', description || '', barcode || '', ranking || '', price || 0]
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
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const results = { processed: 0, errors: [] };

    for (const row of data) {
      const barcode = row['CODIGO DE BARRAS'] || row.Barcode || row.barcode || '';
      const name = row['NOMBRE/DESCRIPCION'] || row.Nombre || row.NOMBRE || row.nombre || row.Producto || row.Product || row.Name;
      const ranking = row.RANKING || row.Ranking || row.ranking || '';
      const rawPrice = row['PRECIO VALE'] || row.Precio || row.Price || 0;
      
      // Clean price (remove $ and commas if string)
      let price = 0;
      if (typeof rawPrice === 'string') {
        price = parseFloat(rawPrice.replace(/[$,]/g, '')) || 0;
      } else {
        price = parseFloat(rawPrice) || 0;
      }

      const presentation = row.Presentacion || row.PRESENTACION || row.presentacion || row.Presentation || '';
      const laboratory = row.Laboratorio || row.LABORATORIO || row.laboratorio || row.Laboratory || '';
      const description = row.Descripcion || row.DESCRIPCION || row.descripcion || row.Description || '';

      if (!name) {
        results.errors.push(`Fila omitida por falta de Nombre: ${JSON.stringify(row)}`);
        continue;
      }

      try {
        // Check for duplicates using name and presentation (case insensitive)
        const nameUpper = (name || '').trim().toUpperCase();
        const presentationUpper = (presentation || '').trim().toUpperCase();

        const { rows: existing } = await db.query(
          'SELECT id FROM products WHERE UPPER(name) = $1 AND UPPER(presentation) = $2',
          [nameUpper, presentationUpper]
        );

        if (existing.length > 0) {
          await db.query(
            `UPDATE products SET laboratory=$1, description=$2, barcode=$3, ranking=$4, price=$5, updated_at=NOW() WHERE id=$6`,
            [laboratory, description, barcode, ranking, price, existing[0].id]
          );
        } else {
          await db.query(
            `INSERT INTO products (name, presentation, laboratory, description, barcode, ranking, price) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [name, presentation, laboratory, description, barcode, ranking, price]
          );
        }
        results.processed++;
      } catch (err) {
        results.errors.push(`Error procesando producto ${name}: ${err.message}`);
      }
    }

    fs.unlinkSync(req.file.path);
    res.json({ message: `Se procesaron ${results.processed} productos exitosamente`, results });
  } catch (err) {
    console.error('Error processing products Excel:', err);
    res.status(500).json({ error: 'Error al procesar archivo de Excel' });
  }
});

// PUT /api/products/:id - Update product
router.put('/:id', async (req, res) => {
  try {
    const { name, presentation, laboratory, description, barcode, ranking, price } = req.body;
    const { rows } = await db.query(
      `UPDATE products SET name=$1, presentation=$2, laboratory=$3, description=$4, barcode=$5, ranking=$6, price=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name, presentation || '', laboratory || '', description || '', barcode || '', ranking || '', price || 0, req.params.id]
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

