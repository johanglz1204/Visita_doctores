const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const db = require('../db');
const { z } = require('zod');
const { validateRequest } = require('../middlewares/validate');

const doctorSchema = z.object({
  body: z.object({
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    specialty: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email("Correo inválido").optional().or(z.literal('')),
    address: z.string().optional(),
    notes: z.string().optional(),
    license: z.string().optional()
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

// GET /api/doctors/:id/stats - Get clinical profile stats
router.get('/:id/stats', async (req, res) => {
  try {
    const knex = db.knex;
    const doctorId = req.params.id;

    const [totalPrescriptionsRow, preferredProducts, recentHistory] = await Promise.all([
      // Total Life-time prescriptions
      knex('sales_history').sum('quantity as total').where('doctor_id', doctorId),
      
      // Top 3 preferred products
      knex('sales_history as s')
        .join('products as p', 's.product_id', 'p.id')
        .select('p.name')
        .sum('s.quantity as quantity')
        .where('s.doctor_id', doctorId)
        .groupBy('p.name')
        .orderBy('quantity', 'desc')
        .limit(3),
        
      // Recent prescription timeline (last 6 months grouped by month-year)
      knex('sales_history as s')
        .select(knex.raw("TO_CHAR(s.sale_date, 'YYYY-MM') as month"))
        .sum('s.quantity as quantity')
        .where('s.doctor_id', doctorId)
        .whereRaw("s.sale_date >= NOW() - INTERVAL '6 months'")
        .groupByRaw("TO_CHAR(s.sale_date, 'YYYY-MM')")
        .orderBy('month', 'asc')
    ]);

    res.json({
      totalPrescriptions: parseInt(totalPrescriptionsRow[0]?.total || 0),
      preferredProducts,
      recentHistory
    });

  } catch (err) {
    console.error('Error fetching doctor stats:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas del doctor' });
  }
});

// POST /api/doctors - Create doctor
router.post('/', validateRequest(doctorSchema), async (req, res) => {
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

    console.log(`[EXCEL UPLOAD] Processing ${data.length} rows from ${sheetName}`);
    if (data.length > 0) {
      console.log(`[EXCEL UPLOAD] Columns found: ${Object.keys(data[0]).join(', ')}`);
    }

    const results = { processed: 0, errors: [] };

    for (const row of data) {
      // Helper function to find a property by matching possible header names
      const findValue = (row, names) => {
        const key = Object.keys(row).find(k => 
          names.some(name => k.trim().toLowerCase() === name.toLowerCase())
        );
        return key ? row[key] : undefined;
      };

      const name = findValue(row, ['Nombre', 'médico', 'medico', 'Doctor', 'Name', 'Nombre del Doctor', 'Medico']);
      const specialty = findValue(row, ['Especialidad', 'Specialty', 'Área', 'Rama']) || '';
      const phone = findValue(row, ['Telefono', 'Teléfono', 'Phone', 'Celular']) || '';
      const email = findValue(row, ['Email', 'Correo', 'Correo Electrónico', 'e-mail']) || '';
      const license = findValue(row, ['Cedula', 'Cédula', 'License', 'Cedula Profesional', 'ID', 'Matrícula']) || '';
      const address = findValue(row, ['Direccion', 'Dirección', 'Address', 'Consultorio']) || '';
      const notes = findValue(row, ['Notas', 'Notitas', 'Notes', 'Observaciones']) || '';

      if (!name) {
        results.errors.push(`Fila omitida por falta de Nombre (visto como: ${JSON.stringify(row)})`);
        console.warn(`[EXCEL UPLOAD SKIP] Row missing Name:`, row);
        continue;
      }

      try {
        // First try to check if it exists by license if license is provided
        let existingId = null;
        if (license && license.toString().trim()) {
           const { rows: byLicense } = await db.query('SELECT id FROM doctors WHERE license = $1', [license.toString().trim()]);
           if (byLicense.length > 0) existingId = byLicense[0].id;
        }

        // If not found by license, try by name
        if (!existingId) {
           const { rows: byName } = await db.query('SELECT id FROM doctors WHERE UPPER(name) = $1', [name.toString().trim().toUpperCase()]);
           if (byName.length > 0) existingId = byName[0].id;
        }

        if (existingId) {
          await db.query(
            `UPDATE doctors SET 
               name = $1, 
               specialty = $2, 
               phone = $3, 
               email = $4, 
               address = $5, 
               notes = $6, 
               license = $7,
               updated_at = NOW()
             WHERE id = $8`,
            [name.toString().trim(), specialty, phone, email, address, notes, license, existingId]
          );
        } else {
          await db.query(
            `INSERT INTO doctors (name, specialty, phone, email, address, notes, license)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [name.toString().trim(), specialty, phone, email, address, notes, license]
          );
        }
        results.processed++;
      } catch (err) {
        results.errors.push(`Error procesando doctor ${name}: ${err.message}`);
        console.error(`[EXCEL UPLOAD ERROR] Row ${JSON.stringify(row)}:`, err);
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
router.put('/:id', validateRequest(doctorSchema), async (req, res) => {
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

// ══════════════════════════════════════════════
// BITÁCORA DE VISITAS
// ══════════════════════════════════════════════

// GET /api/doctors/:id/visits — Historial de visitas
router.get('/:id/visits', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM doctor_visits WHERE doctor_id = $1 ORDER BY visit_date DESC LIMIT 50`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    // Table might not exist yet
    res.json([]);
  }
});

// POST /api/doctors/:id/visits — Registrar visita
router.post('/:id/visits', async (req, res) => {
  try {
    const { samples_left, notes } = req.body;
    const { rows } = await db.query(
      `INSERT INTO doctor_visits (doctor_id, visit_date, samples_left, notes) 
       VALUES ($1, NOW(), $2, $3) RETURNING *`,
      [req.params.id, samples_left || '', notes || '']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating visit:', err);
    res.status(500).json({ error: 'Error al registrar visita' });
  }
});

// DELETE /api/doctors/:id/visits/:visitId
router.delete('/:id/visits/:visitId', async (req, res) => {
  try {
    await db.query('DELETE FROM doctor_visits WHERE id = $1 AND doctor_id = $2', [req.params.visitId, req.params.id]);
    res.json({ message: 'Visita eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// CLASIFICACIÓN AUTOMÁTICA DE DOCTORES
// ══════════════════════════════════════════════

// POST /api/doctors/classify — Clasificar doctores por volumen de prescripción (A/B/C)
router.post('/classify', async (req, res) => {
  try {
    const knex = db.knex;
    
    // Get total prescriptions per doctor in the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];

    const doctorVolumes = await knex('sales_history as s')
      .select('s.doctor_id')
      .sum('s.quantity as total_qty')
      .where('s.sale_date', '>=', sixMonthsAgoStr)
      .whereNotNull('s.doctor_id')
      .groupBy('s.doctor_id')
      .orderBy('total_qty', 'desc');

    if (doctorVolumes.length === 0) {
      return res.json({ message: 'No hay datos suficientes para clasificar.', updates: 0 });
    }

    // Top 20% = A, Next 30% = B, Rest = C
    const total = doctorVolumes.length;
    const cutA = Math.max(1, Math.ceil(total * 0.2));
    const cutB = Math.max(cutA + 1, Math.ceil(total * 0.5));

    let updated = 0;
    for (let i = 0; i < doctorVolumes.length; i++) {
      let cat = 'C';
      if (i < cutA) cat = 'A';
      else if (i < cutB) cat = 'B';

      await knex('doctors')
        .where('id', doctorVolumes[i].doctor_id)
        .update({ category: cat });
      updated++;
    }

    // Set remaining doctors (no sales) as "C"
    await knex('doctors')
      .whereNotIn('id', doctorVolumes.map(d => d.doctor_id))
      .update({ category: 'C' });

    res.json({ 
      message: `Clasificación completada: ${updated} doctores evaluados.`,
      breakdown: {
        A: cutA,
        B: cutB - cutA,
        C: total - cutB
      }
    });
  } catch (err) {
    console.error('Error classifying doctors:', err);
    res.status(500).json({ error: 'Error al clasificar doctores' });
  }
});

module.exports = router;

