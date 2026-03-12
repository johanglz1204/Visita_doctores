const express = require('express');
const router = express.Router();
const db = require('../db');

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
    const { name, specialty, phone, email, address, notes } = req.body;
    const { rows } = await db.query(
      `INSERT INTO doctors (name, specialty, phone, email, address, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, specialty || '', phone || '', email || '', address || '', notes || '']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating doctor:', err);
    res.status(500).json({ error: 'Error al crear doctor' });
  }
});

// PUT /api/doctors/:id - Update doctor
router.put('/:id', async (req, res) => {
  try {
    const { name, specialty, phone, email, address, notes } = req.body;
    const { rows } = await db.query(
      `UPDATE doctors SET name=$1, specialty=$2, phone=$3, email=$4, address=$5, notes=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name, specialty || '', phone || '', email || '', address || '', notes || '', req.params.id]
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
