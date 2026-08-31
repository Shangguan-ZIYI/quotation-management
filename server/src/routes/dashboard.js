const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/stats', (req, res) => {
  const count = (sql) => db.prepare(sql).get().n;
  res.json({
    products: count('SELECT COUNT(*) n FROM products'),
    suppliers: count('SELECT COUNT(*) n FROM product_suppliers'),
    customers: count('SELECT COUNT(*) n FROM customers'),
    inquiries: count('SELECT COUNT(*) n FROM inquiries'),
    quotations: count('SELECT COUNT(*) n FROM quotations'),
    deals: count("SELECT COUNT(*) n FROM quotations WHERE deal_status = 'deal'"),
  });
});

module.exports = router;
