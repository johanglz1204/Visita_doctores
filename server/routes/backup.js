const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Path where the backup SQL file will be written (inside the container at /app)
const BACKUP_PATH = path.join(__dirname, '..', '..', 'backup_auto.sql');

/**
 * Generates a SQL dump of all data using Node.js queries (no pg_dump needed).
 * Returns the SQL string.
 */
async function generateSQLDump() {
  const lines = [];
  const now = new Date().toISOString();

  lines.push(`-- VisitaDoctores Auto Backup`);
  lines.push(`-- Generated: ${now}`);
  lines.push(`-- ============================================================`);
  lines.push('');
  lines.push(`SET client_encoding = 'UTF8';`);
  lines.push('');

  // Helper: escape a value for SQL
  const escape = (val) => {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return val.toString();
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (val instanceof Date) return `'${val.toISOString()}'`;
    return `'${String(val).replace(/'/g, "''")}'`;
  };

  // Tables to backup in order (respects foreign keys)
  const tables = ['doctors', 'products', 'inventory_stocks', 'sales_history'];

  for (const table of tables) {
    try {
      const { rows } = await db.query(`SELECT * FROM ${table} ORDER BY id`);
      lines.push(`-- Table: ${table}`);
      lines.push(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;`);

      if (rows.length > 0) {
        const cols = Object.keys(rows[0]);
        for (const row of rows) {
          const values = cols.map(c => escape(row[c])).join(', ');
          lines.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${values});`);
        }
      }
      lines.push('');
    } catch (err) {
      lines.push(`-- ERROR backing up ${table}: ${err.message}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// POST /api/backup/github — Generate backup and push to GitHub
router.post('/github', async (req, res) => {
  try {
    console.log('📦 Iniciando respaldo a GitHub...');
    const sql = await generateSQLDump();

    // Write to project root (mounted from host in dev, or /app in docker)
    fs.writeFileSync(BACKUP_PATH, sql, 'utf8');
    console.log(`✅ Archivo de respaldo generado: ${BACKUP_PATH}`);

    res.json({ 
      success: true, 
      message: 'Respaldo generado correctamente. Sube manualmente el archivo backup_auto.sql a GitHub desde tu computadora.',
      rows: sql.split('\n').filter(l => l.startsWith('INSERT')).length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Error al generar respaldo:', err);
    res.status(500).json({ error: `Error al generar respaldo: ${err.message}` });
  }
});

// GET /api/backup/download — Download the backup as a SQL file
router.get('/download', async (req, res) => {
  try {
    console.log('📦 Generando respaldo para descarga...');
    const sql = await generateSQLDump();
    const filename = `backup_${new Date().toISOString().slice(0, 10)}.sql`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/sql');
    res.send(sql);
    console.log(`✅ Respaldo descargado: ${filename}`);
  } catch (err) {
    console.error('❌ Error al descargar respaldo:', err);
    res.status(500).json({ error: `Error al generar respaldo: ${err.message}` });
  }
});

module.exports = router;
module.exports.generateSQLDump = generateSQLDump;
