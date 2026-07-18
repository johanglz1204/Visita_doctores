const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const sqlFile = path.join(__dirname, '..', '..', 'backup_final_sesion.sql');
const dbPath = path.join(__dirname, '..', '..', 'database.sqlite');

if (!fs.existsSync(sqlFile)) {
    console.error('No se encontró backup_final_sesion.sql');
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);

async function migrate() {
    return new Promise((resolve, reject) => {
        const content = fs.readFileSync(sqlFile, 'utf16le');
        const lines = content.split('\n');

        let currentTable = null;
        let columns = [];
        let rowCount = 0;

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                if (line.startsWith('COPY public.')) {
                    // Extract table name and columns
                    // COPY public.doctors (id, name) FROM stdin;
                    const match = line.match(/COPY public\.(\w+) \((.*?)\)/);
                    if (match) {
                        currentTable = match[1];
                        columns = match[2].split(',').map(c => c.trim());
                        console.log(`Migrando tabla: ${currentTable}...`);
                    }
                    continue;
                }

                if (currentTable && line === '\\.') {
                    console.log(`Finalizada tabla ${currentTable} con ${rowCount} filas.`);
                    currentTable = null;
                    columns = [];
                    rowCount = 0;
                    continue;
                }

                if (currentTable && line !== '') {
                    // It's a data row separated by tabs
                    const values = line.split('\t').map(val => {
                        if (val === '\\N') return null;
                        return val;
                    });

                    // Build INSERT statement
                    const placeholders = values.map(() => '?').join(', ');
                    const query = `INSERT OR IGNORE INTO ${currentTable} (${columns.join(', ')}) VALUES (${placeholders})`;

                    db.run(query, values, (err) => {
                        if (err) {
                            // ignore errors about missing columns like 'license'
                            if (!err.message.includes('has no column named')) {
                                console.error(`Error insertando en ${currentTable}:`, err.message);
                            }
                        }
                    });
                    rowCount++;
                }
            }

            db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

console.log('Iniciando migración de PostgreSQL a SQLite...');
migrate()
    .then(() => {
        console.log('Migración completada exitosamente.');
        db.close();
    })
    .catch(err => {
        console.error('Error durante la migración:', err);
        db.close();
    });
