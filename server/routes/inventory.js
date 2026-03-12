const express = require('express');
const router = express.Router();
const db = require('../db');

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
        p.presentation AS product_presentation,
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
        p.presentation AS product_presentation,
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
