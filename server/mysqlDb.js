/**
 * mysqlDb.js
 * Conexión de SOLO LECTURA a la base de datos MySQL de la sucursal (dbsicofa).
 * El usuario configurado (visitadoc_reader) únicamente tiene permiso SELECT.
 */
const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host:     process.env.MYSQL_HOST,
      port:     parseInt(process.env.MYSQL_PORT) || 3306,
      user:     process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit:    5,
      queueLimit:         0,
      connectTimeout:     10000,
      // Sin SSL ya que es red local/privada
    });
    console.log(`🔌 MySQL pool configurado → ${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT}/${process.env.MYSQL_DATABASE}`);
  }
  return pool;
}

/**
 * Ejecuta una query de solo lectura contra MySQL.
 * @param {string} sql  - Sentencia SQL (solo SELECT)
 * @param {any[]}  params - Parámetros para prepared statements
 * @returns {Promise<any[]>} Filas resultado
 */
async function queryMySQL(sql, params = []) {
  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Prueba la conexión y devuelve true/false.
 */
async function testConnection() {
  try {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT 1 AS ok');
    return rows[0]?.ok === 1;
  } catch (err) {
    console.error('❌ [MySQL] Error de conexión:', err.message);
    return false;
  }
}

module.exports = { queryMySQL, testConnection };
