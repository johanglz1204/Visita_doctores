const express = require('express');
const router = express.Router();
const db = require('../db');

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
    const { name, presentation, laboratory, description } = req.body;
    const { rows } = await db.query(
      `INSERT INTO products (name, presentation, laboratory, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, presentation || '', laboratory || '', description || '']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// PUT /api/products/:id - Update product
router.put('/:id', async (req, res) => {
  try {
    const { name, presentation, laboratory, description } = req.body;
    const { rows } = await db.query(
      `UPDATE products SET name=$1, presentation=$2, laboratory=$3, description=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [name, presentation || '', laboratory || '', description || '', req.params.id]
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
