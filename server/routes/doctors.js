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
    cb(null, `docs-${Date.now()}-${file.originalname}`);
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

// GET /api/doctors - List all doctors
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM doctors ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching doctors:', err);
    res.status(500).json({ error: 'Error al obtener doctores' });
  }
});

// GET /api/doctors/:id - Get single doctor
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM doctors WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Doctor no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching doctor:', err);
    res.status(500).json({ error: 'Error al obtener doctor' });
  }
});

// POST /api/doctors - Create doctor
router.post('/', async (req, res) => {
  try {
    const { name, specialty, phone, email, address, notes, license } = req.body;
    const { rows } = await db.query(
      `INSERT INTO doctors (name, specialty, phone, email, address, notes, license)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, specialty || '', phone || '', email || '', address || '', notes || '', license || '']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating doctor:', err);
    res.status(500).json({ error: 'Error al crear doctor' });
  }
});

// POST /api/doctors/upload-excel - Upload Excel and update doctors
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
      const name = row.Nombre || row.NOMBRE || row.nombre || row.Doctor || row.Name;
      const specialty = row.Especialidad || row.ESPECIALIDAD || row.especialidad || row.Specialty || '';
      const phone = row.Telefono || row.TELEFONO || row.telefono || row.Phone || '';
      const email = row.Email || row.EMAIL || row.email || '';
      const license = row.Cedula || row.CEDULA || row.cedula || row.License || row.LICENSE || '';
      const address = row.Direccion || row.DIRECCION || row.direccion || row.Address || '';
      const notes = row.Notas || row.NOTAS || row.notas || row.Notes || '';

      if (!name) {
        results.errors.push(`Fila omitida por falta de Nombre: ${JSON.stringify(row)}`);
        continue;
      }

      try {
        await db.query(
          `INSERT INTO doctors (name, specialty, phone, email, address, notes, license)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET 
             name = EXCLUDED.name, 
             specialty = EXCLUDED.specialty, 
             phone = EXCLUDED.phone, 
             email = EXCLUDED.email, 
             address = EXCLUDED.address, 
             notes = EXCLUDED.notes, 
             license = EXCLUDED.license,
             updated_at = NOW()`,
          [name, specialty, phone, email, address, notes, license]
        );
        results.processed++;
      } catch (err) {
        // Fallback for when there's no ID but name might match or just insert
        try {
          // Check if doctor with same name exists
          const { rows: existing } = await db.query('SELECT id FROM doctors WHERE UPPER(name) = $1', [name.toUpperCase()]);
          if (existing.length > 0) {
            await db.query(
              `UPDATE doctors SET specialty=$1, phone=$2, email=$3, address=$4, notes=$5, license=$6, updated_at=NOW() WHERE id=$7`,
              [specialty, phone, email, address, notes, license, existing[0].id]
            );
          } else {
            await db.query(
              `INSERT INTO doctors (name, specialty, phone, email, address, notes, license) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [name, specialty, phone, email, address, notes, license]
            );
          }
          results.processed++;
        } catch (innerErr) {
          results.errors.push(`Error procesando doctor ${name}: ${innerErr.message}`);
        }
      }
    }

    fs.unlinkSync(req.file.path);
    res.json({ message: `Se procesaron ${results.processed} doctores exitosamente`, results });
  } catch (err) {
    console.error('Error processing doctors Excel:', err);
    res.status(500).json({ error: 'Error al procesar archivo de Excel' });
  }
});

// PUT /api/doctors/:id - Update doctor
router.put('/:id', async (req, res) => {
  try {
    const { name, specialty, phone, email, address, notes, license } = req.body;
    const { rows } = await db.query(
      `UPDATE doctors SET name=$1, specialty=$2, phone=$3, email=$4, address=$5, notes=$6, license=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name, specialty || '', phone || '', email || '', address || '', notes || '', license || '', req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Doctor no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating doctor:', err);
    res.status(500).json({ error: 'Error al actualizar doctor' });
  }
});

// DELETE /api/doctors/:id - Delete doctor
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM doctors WHERE id=$1 RETURNING *', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Doctor no encontrado' });
    res.json({ message: 'Doctor eliminado', doctor: rows[0] });
  } catch (err) {
    console.error('Error deleting doctor:', err);
    res.status(500).json({ error: 'Error al eliminar doctor' });
  }
});

module.exports = router;

