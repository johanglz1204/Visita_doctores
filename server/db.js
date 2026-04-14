const { Pool } = require('pg');

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
};

// Render require SSL para conexiones externas
if (process.env.NODE_ENV === 'production') {
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

const knex = require('knex')({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },
  pool: { min: 2, max: 10 }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  knex,
};
