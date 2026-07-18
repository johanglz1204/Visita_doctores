const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const knex = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: dbPath
  },
  useNullAsDefault: true,
  pool: {
    afterCreate: (conn, cb) => {
      conn.run('PRAGMA foreign_keys = ON', cb);
    }
  }
});

module.exports = {
  query: (text, params) => {
    // Translate PostgreSQL $1, $2, etc. to ?
    let sqliteText = text.replace(/\$\d+/g, '?');
    
    // Some basic translation for Postgres specific types
    sqliteText = sqliteText.replace(/TIMESTAMPTZ/g, 'DATETIME');
    sqliteText = sqliteText.replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT');

    return new Promise((resolve, reject) => {
      const isSelectOrReturning = sqliteText.trim().toUpperCase().startsWith('SELECT') || sqliteText.toUpperCase().includes('RETURNING');
      
      if (isSelectOrReturning) {
        db.all(sqliteText, params || [], (err, rows) => {
          if (err) return reject(err);
          resolve({ rows: rows || [] });
        });
      } else {
        db.run(sqliteText, params || [], function(err) {
          if (err) return reject(err);
          resolve({ rows: [], rowCount: this.changes, lastID: this.lastID });
        });
      }
    });
  },
  pool: db, // just in case
  knex,
};
