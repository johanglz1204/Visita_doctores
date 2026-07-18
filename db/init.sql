-- ============================================
-- VisitaDoctores - Database Schema (SQLite)
-- ============================================

-- ============================================
-- Table: users
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default admin user with password 'admin' (bcrypt hashed)
INSERT INTO users (username, password) 
VALUES ('admin', '$2a$10$B00ZUSq2l8.S9v124H60QezcQ09b.I5p2Lg735P.l.q7bH7X.a1yC')
ON CONFLICT (username) DO NOTHING;

-- ============================================
-- Table: doctors
-- ============================================
CREATE TABLE IF NOT EXISTS doctors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    specialty   TEXT DEFAULT '',
    phone       TEXT DEFAULT '',
    email       TEXT DEFAULT '',
    address     TEXT DEFAULT '',
    notes       TEXT DEFAULT '',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_doctors_name ON doctors(name);

-- ============================================
-- Table: products
-- ============================================
CREATE TABLE IF NOT EXISTS products (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    presentation  TEXT DEFAULT '',
    laboratory    TEXT DEFAULT '',
    barcode       TEXT DEFAULT '',
    ranking       TEXT DEFAULT '',
    price         REAL DEFAULT 0,
    stock         INTEGER DEFAULT 0,
    min_stock     INTEGER DEFAULT 0,
    target_stock  INTEGER DEFAULT 0,
    description   TEXT DEFAULT '',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- ============================================
-- Table: inventory_stocks
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_stocks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id     INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    target_stock  INTEGER NOT NULL DEFAULT 0,
    current_stock INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(doctor_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_doctor ON inventory_stocks(doctor_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_stocks(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_critical ON inventory_stocks(current_stock);

-- ============================================
-- Table: sales_history
-- ============================================
CREATE TABLE IF NOT EXISTS sales_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id   INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
    product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
    quantity    INTEGER NOT NULL DEFAULT 1,
    sale_date   TEXT NOT NULL,
    raw_text    TEXT DEFAULT '',
    parsed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    sucursal    TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sales_doctor ON sales_history(doctor_id);
CREATE INDEX IF NOT EXISTS idx_sales_product ON sales_history(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_history(sale_date);

-- ============================================
-- Table: stock_out_history
-- ============================================
CREATE TABLE IF NOT EXISTS stock_out_history (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    start_date        DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_date          DATETIME,
    last_stock_value  INTEGER DEFAULT 0,
    estimated_loss    REAL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_stock_out_product ON stock_out_history(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_out_dates ON stock_out_history(start_date, end_date);

-- ============================================
-- Seed: common products
-- ============================================
INSERT INTO products (name, presentation, laboratory) VALUES
    ('FARMAPRAM', '0.50 MG', 'Productos Medix'),
    ('FARMAPRAM', '1.00 MG', 'Productos Medix'),
    ('FARMAPRAM', '2.00 MG', 'Productos Medix')
ON CONFLICT DO NOTHING;
