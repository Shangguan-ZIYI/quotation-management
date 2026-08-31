const express = require('express');
const db = require('../db');

const router = express.Router();

// 报价数据库:所有客户混合数据 + 搜索筛选
// query: customer, product_number, status(deal|pending)
router.get('/', (req, res) => {
  const customer = (req.query.customer || '').trim();
  const pn = (req.query.product_number || '').trim();
  const status = (req.query.status || '').trim();

  let sql = `
    SELECT q.*, c.name AS customer_name, c.country AS customer_country,
           p.file_name AS pi_file_name
    FROM quotations q
    JOIN customers c ON q.customer_id = c.id
    LEFT JOIN pi_uploads p ON q.pi_id = p.id
    WHERE 1=1
  `;
  const params = [];
  if (customer) { sql += ' AND c.name LIKE ?'; params.push(`%${customer}%`); }
  if (pn) { sql += ' AND q.product_number LIKE ?'; params.push(`%${pn}%`); }
  if (status === 'deal' || status === 'pending') { sql += ' AND q.deal_status = ?'; params.push(status); }
  sql += ' ORDER BY q.created_at DESC, q.id DESC LIMIT 2000';
  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
