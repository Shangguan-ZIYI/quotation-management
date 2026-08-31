const express = require('express');
const db = require('../db');
const { makeUploader } = require('../upload');
const { parsePiAndMatch } = require('../pi-parser');

const router = express.Router();
const piUpload = makeUploader('pi', ['.xlsx', '.xls', '.csv', '.pdf'], 30);

// 客户列表:名称搜索 + 国家筛选
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const country = (req.query.country || '').trim();
  let sql = 'SELECT * FROM customers WHERE 1=1';
  const params = [];
  if (q) { sql += ' AND name LIKE ?'; params.push(`%${q}%`); }
  if (country) { sql += ' AND country = ?'; params.push(country); }
  sql += ' ORDER BY name LIMIT 1000';
  res.json(db.prepare(sql).all(...params));
});

router.get('/countries', (req, res) => {
  const rows = db.prepare(
    "SELECT DISTINCT country FROM customers WHERE country IS NOT NULL AND country != '' ORDER BY country"
  ).all();
  res.json(rows.map((r) => r.country));
});

router.post('/', (req, res) => {
  const { name, country, contact, email, phone, remark } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Customer Name 不能为空' });
  const n = String(name).trim();
  const exists = db.prepare('SELECT id FROM customers WHERE name = ?').get(n);
  if (exists) return res.status(409).json({ error: `客户 ${n} 已存在` });
  const info = db.prepare(
    'INSERT INTO customers (name, country, contact, email, phone, remark) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(n, country || null, contact || null, email || null, phone || null, remark || null);
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: '客户不存在' });
  const { name, country, contact, email, phone, remark } = req.body;
  db.prepare(
    'UPDATE customers SET name = ?, country = ?, contact = ?, email = ?, phone = ?, remark = ? WHERE id = ?'
  ).run(name ?? c.name, country ?? c.country, contact ?? c.contact,
    email ?? c.email, phone ?? c.phone, remark ?? c.remark, c.id);
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(c.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: '客户不存在' });
  res.json({ ok: true });
});

// 客户详情:档案 + 历史询价 + 成交记录 + 排序
// sort: date | deal_qty | deal_total
router.get('/:id/detail', (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: '客户不存在' });

  const items = db.prepare(`
    SELECT ii.*, i.created_at AS inquiry_date, i.title AS inquiry_title
    FROM inquiry_items ii JOIN inquiries i ON ii.inquiry_id = i.id
    WHERE i.customer_id = ?
    ORDER BY i.created_at DESC, ii.id DESC
  `).all(c.id);

  const sort = req.query.sort || 'deal_qty';
  const orderCol = sort === 'deal_total' ? 'total_deal_amount' : 'total_deal_qty';
  const dealSummary = db.prepare(`
    SELECT ii.product_number,
           MAX(ii.product_name) AS product_name,
           SUM(ii.quantity) AS total_deal_qty,
           SUM(ii.deal_total) AS total_deal_amount,
           MAX(ii.deal_currency) AS deal_currency,
           COUNT(*) AS deal_count
    FROM inquiry_items ii JOIN inquiries i ON ii.inquiry_id = i.id
    WHERE i.customer_id = ? AND ii.deal_status = 'deal'
    GROUP BY ii.product_number
    ORDER BY ${orderCol} DESC
  `).all(c.id);

  const piList = db.prepare(
    'SELECT * FROM pi_uploads WHERE customer_id = ? ORDER BY uploaded_at DESC'
  ).all(c.id);

  res.json({ customer: c, items, dealSummary, piList });
});

// 客户 PI 上传(位于 Customer Detail 内部)
router.post('/:id/pi', piUpload.single('file'), (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: '客户不存在' });
  if (!req.file) return res.status(400).json({ error: '未接收到 PI 文件' });

  const original = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const info = db.prepare(
    'INSERT INTO pi_uploads (customer_id, file_name, file_path) VALUES (?, ?, ?)'
  ).run(c.id, original, `/uploads/pi/${req.file.filename}`);
  const piId = info.lastInsertRowid;

  parsePiAndMatch(req.file.path, c.id, piId)
    .then((result) => {
      db.prepare('UPDATE pi_uploads SET currency = ?, parse_summary = ? WHERE id = ?')
        .run(result.currency || null, JSON.stringify(result.summary), piId);
      res.json({ ok: true, pi_id: piId, ...result });
    })
    .catch((err) => {
      db.prepare('UPDATE pi_uploads SET parse_summary = ? WHERE id = ?')
        .run(JSON.stringify({ error: err.message }), piId);
      res.status(422).json({ error: `PI 无法读取或解析失败: ${err.message}`, pi_id: piId });
    });
});

module.exports = router;
