const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const db = require('../db');
const { parseTicket } = require('../parser');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain' || path.extname(file.originalname).toLowerCase() === '.txt') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .txt'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// GET /api/sales - List sales history
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const sucursal = req.query.sucursal;

    let query = `
      SELECT 
        s.id,
        s.doctor_id,
        d.name AS doctor_name,
        s.product_id,
        p.name AS product_name,
        s.quantity,
        s.sale_date + INTERVAL '12 hours' as sale_date,
        s.sucursal,
        s.raw_text,
        s.parsed_at,
        s.created_at
      FROM sales_history s
      LEFT JOIN doctors d ON s.doctor_id = d.id
      LEFT JOIN products p ON s.product_id = p.id
    `;
    
    const params = [limit, offset];
    if (sucursal && sucursal.toUpperCase() !== 'TODAS') {
      query += ` WHERE UPPER(s.sucursal) = $3 `;
      params.push(sucursal.toUpperCase());
    }

    query += ` ORDER BY s.sale_date DESC, s.created_at DESC LIMIT $1 OFFSET $2`;

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching sales:', err);
    res.status(500).json({ error: 'Error al obtener historial de ventas' });
  }
});

// POST /api/sales/upload - Upload TXT, parse, and record sales
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó archivo' });
    }

    // Read the uploaded file
    const content = fs.readFileSync(req.file.path, 'utf-8');
    const parsed = parseTicket(content);

    if (parsed.length === 0) {
      return res.status(400).json({ 
        error: 'No se pudieron extraer datos del archivo',
        filename: req.file.originalname,
      });
    }

    const results = [];

    for (const record of parsed) {
      // Find or create doctor
      let doctorId = null;
      if (record.doctor) {
        let { rows: existingDocs } = await db.query(
          'SELECT id FROM doctors WHERE UPPER(name) = $1',
          [record.doctor.toUpperCase()]
        );
        if (existingDocs.length > 0) {
          doctorId = existingDocs[0].id;
        } else {
          const { rows: newDoc } = await db.query(
            'INSERT INTO doctors (name) VALUES ($1) RETURNING id',
            [record.doctor]
          );
          doctorId = newDoc[0].id;
        }
      }

          // Find or create product
      let productId = null;
      if (record.product) {
        let { rows: existingProds } = await db.query(
          `SELECT id FROM products WHERE UPPER(trim(name)) = $1`,
          [record.product.toUpperCase()]
        );
        if (existingProds.length > 0) {
          productId = existingProds[0].id;
        } else {
          const { rows: newProd } = await db.query(
            'INSERT INTO products (name) VALUES ($1) RETURNING id',
            [record.product]
          );
          productId = newProd[0].id;
        }
      }

      // Record sale
      const { rows: sale } = await db.query(
        `INSERT INTO sales_history (doctor_id, product_id, quantity, sale_date, sucursal, raw_text)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [doctorId, productId, record.quantity, record.date, record.sucursal || '', record.rawText]
      );

      // Decrement inventory stock if assignment exists
      if (doctorId && productId) {
        await db.query(
          `UPDATE inventory_stocks 
           SET current_stock = GREATEST(current_stock - $1, 0), updated_at = NOW()
           WHERE doctor_id = $2 AND product_id = $3`,
          [record.quantity, doctorId, productId]
        );
      }

      results.push({
        sale: sale[0],
        parsed: record,
        doctor_id: doctorId,
        product_id: productId,
      });
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      message: `Se procesaron ${results.length} registro(s) exitosamente`,
      filename: req.file.originalname,
      records: results,
    });
  } catch (err) {
    console.error('Error processing upload:', err);
    res.status(500).json({ error: 'Error al procesar archivo' });
  }
});

// GET /api/sales/export-excel - Export sales history to Excel
router.get('/export-excel', async (req, res) => {
  try {
    const sucursal = req.query.sucursal;
    let query = `
      SELECT 
        d.name AS doctor_name,
        s.sale_date,
        s.sucursal,
        SUM(s.quantity) AS total_quantity,
        SUM(s.quantity * COALESCE(p.price, 0)) AS total_amount
      FROM sales_history s
      LEFT JOIN doctors d ON s.doctor_id = d.id
      LEFT JOIN products p ON s.product_id = p.id
    `;
    
    const params = [];
    if (sucursal) {
      query += ` WHERE UPPER(s.sucursal) = $1 `;
      params.push(sucursal.toUpperCase());
    }

    query += `
      GROUP BY d.name, s.sale_date, s.sucursal
      ORDER BY s.sale_date DESC, d.name ASC
    `;

    const { rows } = await db.query(query, params);
    
    // Map data to pretty headers
    const data = rows.map(r => ({
      'Doctor': r.doctor_name || 'Desconocido',
      'Sucursal': r.sucursal || '—',
      'Fecha de Venta': r.sale_date ? new Date(r.sale_date).toLocaleDateString('es-MX', { timeZone: 'UTC' }) : '—',
      'Cantidad Total': parseInt(r.total_quantity) || 0,
      'Monto Total ($)': parseFloat(r.total_amount) || 0
    }));

    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Resumen de Ventas');
    
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Resumen_Ventas_Agrupado.xlsx');
    res.send(buffer);
  } catch (err) {
    console.error('Error exporting sales:', err);
    res.status(500).json({ error: 'Error al exportar historial de ventas' });
  }
});

// POST /api/sales/parse-preview - Preview parse without saving
router.post('/parse-preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó archivo' });
    }

    const content = fs.readFileSync(req.file.path, 'utf-8');
    const parsed = parseTicket(content);

    // Clean up
    fs.unlinkSync(req.file.path);

    res.json({
      filename: req.file.originalname,
      recordsFound: parsed.length,
      records: parsed,
    });
  } catch (err) {
    console.error('Error parsing preview:', err);
    res.status(500).json({ error: 'Error al previsualizar archivo' });
  }
});

// GET /api/sales/branches - Get unique branches
router.get('/branches', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT DISTINCT sucursal 
      FROM sales_history 
      WHERE sucursal IS NOT NULL AND sucursal != ''
      ORDER BY sucursal ASC
    `);
    res.json(rows.map(r => r.sucursal));
  } catch (err) {
    console.error('Error fetching branches:', err);
    res.status(500).json({ error: 'Error al obtener sucursales' });
  }
});

module.exports = router;
