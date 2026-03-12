-- ============================================
-- VisitaDoctores - Database Schema
-- ============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Table: doctors
-- ============================================
CREATE TABLE IF NOT EXISTS doctors (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    specialty   VARCHAR(255) DEFAULT '',
    phone       VARCHAR(50) DEFAULT '',
    email       VARCHAR(255) DEFAULT '',
    address     TEXT DEFAULT '',
    notes       TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_doctors_name ON doctors(name);

-- ============================================
-- Table: products
-- ============================================
CREATE TABLE IF NOT EXISTS products (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    presentation  VARCHAR(255) DEFAULT '',
    laboratory    VARCHAR(255) DEFAULT '',
    description   TEXT DEFAULT '',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_name ON products(name);

-- ============================================
-- Table: inventory_stocks
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_stocks (
    id            SERIAL PRIMARY KEY,
    doctor_id     INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    target_stock  INTEGER NOT NULL DEFAULT 0,
    current_stock INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(doctor_id, product_id)
);

CREATE INDEX idx_inventory_doctor ON inventory_stocks(doctor_id);
CREATE INDEX idx_inventory_product ON inventory_stocks(product_id);
CREATE INDEX idx_inventory_critical ON inventory_stocks(current_stock);

-- ============================================
-- Table: sales_history
-- ============================================
CREATE TABLE IF NOT EXISTS sales_history (
    id          SERIAL PRIMARY KEY,
    doctor_id   INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
    product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
    quantity    INTEGER NOT NULL DEFAULT 1,
    sale_date   DATE NOT NULL,
    raw_text    TEXT DEFAULT '',
    parsed_at   TIMESTAMPTZ DEFAULT NOW(),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sales_doctor ON sales_history(doctor_id);
CREATE INDEX idx_sales_product ON sales_history(product_id);
CREATE INDEX idx_sales_date ON sales_history(sale_date);

-- ============================================
-- Seed: common products
-- ============================================
INSERT INTO products (name, presentation, laboratory) VALUES
    ('FARMAPRAM', '0.50 MG', 'Productos Medix'),
    ('FARMAPRAM', '1.00 MG', 'Productos Medix'),
    ('FARMAPRAM', '2.00 MG', 'Productos Medix')
ON CONFLICT DO NOTHING;
