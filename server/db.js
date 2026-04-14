const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

const knex = require('knex')({
  client: 'pg',
  connection: process.env.DATABASE_URL + (process.env.NODE_ENV === 'production' ? '?ssl=true' : ''),
  // Para db locales con SSL auto-firmado o nubes que lo requieran:
  pool: { min: 2, max: 10 }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  knex,
};
