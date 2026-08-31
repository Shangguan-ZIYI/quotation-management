const express = require('express');
const db = require('../db');
const { makeUploader } = require('../upload');
const { importProductExcel } = require('../importers');

const router = express.Router();
const imageUpload = makeUploader('images', ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'], 10);
const excelUpload = makeUploader('imports', ['.xlsx', '.xls', '.csv'], 30);

function attachSuppliers(products) {
  const stmt = db.prepare('SELECT * FROM product_suppliers WHERE product_id = ? ORDER BY price ASC');
  return products.map((p) => ({ ...p, suppliers: stmt.all(p.id) }));
}

// 列表 + 搜索(Product Number / 名称)
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    rows = db.prepare(`
      SELECT * FROM products
      WHERE product_number LIKE ? OR name_cn LIKE ? OR name_en LIKE ?
      ORDER BY product_number LIMIT 500
    `).all(`%${q}%`, `%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare('SELECT * FROM products ORDER BY product_number LIMIT 500').all();
  }
  res.json(attachSuppliers(rows));
});

router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '产品不存在' });
  res.json(attachSuppliers([p])[0]);
});

// 新建产品(可同时带多个供应商)
router.post('/', (req, res) => {
  const { product_number, name_cn, name_en, description, weight, remark, suppliers } = req.body;
  if (!product_number || !String(product_number).trim()) {
    return res.status(400).json({ error: 'Product Number 不能为空' });
  }
  const pn = String(product_number).trim();
  const exists = db.prepare('SELECT id FROM products WHERE product_number = ?').get(pn);
  if (exists) return res.status(409).json({ error: `Product Number ${pn} 已存在` });

  const tx = db.transaction(() => {
    const info = db.prepare(
      'INSERT INTO products (product_number, name_cn, name_en, description, weight, remark) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(pn, name_cn || null, name_en || null, description || null, weight ?? null, remark || null);
    const pid = info.lastInsertRowid;
    if (Array.isArray(suppliers)) {
      const ins = db.prepare(
        'INSERT INTO product_suppliers (product_id, supplier_name, price, price_ex_tax, lead_time) VALUES (?, ?, ?, ?, ?)'
      );
      for (const s of suppliers) {
        if (s.supplier_name && String(s.supplier_name).trim()) {
          ins.run(pid, String(s.supplier_name).trim(), s.price ?? null, s.price_ex_tax ?? null, s.lead_time || null);
        }
      }
    }
    return pid;
  });
  const pid = tx();
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
  res.status(201).json(attachSuppliers([p])[0]);
});

router.put('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '产品不存在' });
  const { name_cn, name_en, description, weight, remark } = req.body;
  db.prepare(`
    UPDATE products SET name_cn = ?, name_en = ?, description = ?, weight = ?, remark = ?,
      updated_at = datetime('now','localtime') WHERE id = ?
  `).run(name_cn ?? p.name_cn, name_en ?? p.name_en, description ?? p.description, weight ?? p.weight, remark ?? p.remark, p.id);
  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(p.id);
  res.json(attachSuppliers([updated])[0]);
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: '产品不存在' });
  res.json({ ok: true });
});

// 供应商管理
router.post('/:id/suppliers', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '产品不存在' });
  const { supplier_name, price, price_ex_tax, lead_time } = req.body;
  if (!supplier_name || !String(supplier_name).trim()) {
    return res.status(400).json({ error: 'Supplier Name 不能为空' });
  }
  try {
    db.prepare(
      'INSERT INTO product_suppliers (product_id, supplier_name, price, price_ex_tax, lead_time) VALUES (?, ?, ?, ?, ?)'
    ).run(p.id, String(supplier_name).trim(), price ?? null, price_ex_tax ?? null, lead_time || null);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: '该产品下此供应商已存在' });
    }
    throw e;
  }
  res.status(201).json(attachSuppliers([p])[0]);
});

router.put('/suppliers/:sid', (req, res) => {
  const s = db.prepare('SELECT * FROM product_suppliers WHERE id = ?').get(req.params.sid);
  if (!s) return res.status(404).json({ error: '供应商记录不存在' });
  const { supplier_name, price, price_ex_tax, lead_time } = req.body;
  db.prepare('UPDATE product_suppliers SET supplier_name = ?, price = ?, price_ex_tax = ?, lead_time = ? WHERE id = ?')
    .run(supplier_name ?? s.supplier_name, price ?? s.price, price_ex_tax ?? s.price_ex_tax, lead_time ?? s.lead_time, s.id);
  res.json({ ok: true });
});

router.delete('/suppliers/:sid', (req, res) => {
  const info = db.prepare('DELETE FROM product_suppliers WHERE id = ?').run(req.params.sid);
  if (!info.changes) return res.status(404).json({ error: '供应商记录不存在' });
  res.json({ ok: true });
});

// 产品图片上传
router.post('/:id/image', imageUpload.single('image'), (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '产品不存在' });
  if (!req.file) return res.status(400).json({ error: '未接收到图片文件' });
  const rel = `/uploads/images/${req.file.filename}`;
  db.prepare("UPDATE products SET image_path = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(rel, p.id);
  res.json({ ok: true, image_path: rel });
});

// 总库(供应商库)Excel 导入
router.post('/import', excelUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未接收到 Excel 文件' });
  try {
    const summary = await importProductExcel(req.file.path);
    res.json({ ok: true, summary });
  } catch (e) {
    res.status(400).json({ error: `总库导入失败: ${e.message}` });
  }
});

module.exports = router;
