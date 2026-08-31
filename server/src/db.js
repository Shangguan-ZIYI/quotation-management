const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { dataDir } = require('./paths');

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_number TEXT NOT NULL UNIQUE,
  name_cn TEXT,
  name_en TEXT,
  weight REAL,
  image_path TEXT,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS product_suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  price REAL,
  lead_time TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(product_id, supplier_name)
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  country TEXT,
  contact TEXT,
  email TEXT,
  phone TEXT,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS pi_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  file_name TEXT,
  file_path TEXT,
  currency TEXT,
  parse_summary TEXT,
  uploaded_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS inquiry_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  product_number TEXT NOT NULL,
  product_name TEXT,
  supplier_name TEXT,
  quantity REAL,
  unit_price REAL,
  deal_status TEXT NOT NULL DEFAULT 'pending',
  deal_total REAL,
  deal_currency TEXT,
  pi_id INTEGER REFERENCES pi_uploads(id),
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_item_id INTEGER REFERENCES inquiry_items(id) ON DELETE SET NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_number TEXT NOT NULL,
  product_name TEXT,
  supplier_name TEXT,
  quantity REAL,
  unit_price REAL,
  deal_status TEXT NOT NULL DEFAULT 'pending',
  deal_total REAL,
  deal_currency TEXT,
  pi_id INTEGER REFERENCES pi_uploads(id),
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_products_number ON products(product_number);
CREATE INDEX IF NOT EXISTS idx_suppliers_product ON product_suppliers(product_id);
CREATE INDEX IF NOT EXISTS idx_items_inquiry ON inquiry_items(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_items_number ON inquiry_items(product_number);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_number ON quotations(product_number);
`);

// 增量字段迁移(根据真实模板结构新增)
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
ensureColumn('products', 'description', 'TEXT');            // 供应商库:描述
ensureColumn('product_suppliers', 'price_ex_tax', 'REAL');  // 供应商库:未税价(price = 含税运价)
ensureColumn('pi_uploads', 'invoice_no', 'TEXT');           // PI:Invoice No.

module.exports = db;
