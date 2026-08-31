const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');
const { makeUploader } = require('../upload');
const { parseInquiryExcel } = require('../importers');
const { normalizePn } = require('../excel-utils');

const router = express.Router();
const excelUpload = makeUploader('imports', ['.xlsx', '.xls', '.csv'], 30);

// 询价匹配总库:以 Product Number 为依据,一个件号多个供应商时全部返回
// body: { items: [{ product_number, quantity, unit_price }] }
router.post('/match', (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: '没有可匹配的询价明细' });

  const findProduct = db.prepare('SELECT * FROM products WHERE product_number = ?');
  const findSuppliers = db.prepare('SELECT * FROM product_suppliers WHERE product_id = ? ORDER BY price ASC');

  const results = items.map((item, idx) => {
    const pnInput = String(item.product_number || '').trim();
    if (!pnInput) {
      return { row: idx + 1, product_number: '', matched: false, error: 'Product Number 缺失', quantity: item.quantity ?? null, suppliers: [] };
    }
    // 先按原值精确匹配,再按去除 OP 前缀后的件号匹配
    const pn = normalizePn(pnInput);
    const p = findProduct.get(pnInput) || (pn !== pnInput ? findProduct.get(pn) : null);
    if (!p) {
      return { row: idx + 1, product_number: pnInput, matched: false, quantity: item.quantity ?? null, unit_price: item.unit_price ?? null, suppliers: [] };
    }
    return {
      row: idx + 1,
      product_number: p.product_number,
      matched: true,
      product_id: p.id,
      name_cn: p.name_cn,
      name_en: p.name_en,
      description: p.description,
      weight: p.weight,
      image_path: p.image_path,
      remark: p.remark,
      quantity: item.quantity ?? null,
      unit_price: item.unit_price ?? null,
      suppliers: findSuppliers.all(p.id),
    };
  });
  res.json({ results });
});

// 保存询价:客户不存在则自动建档;同时写入客户历史 + Quotation Database
// body: { customer: { id } 或 { name, country, ... }, title, items: [...] }
router.post('/', (req, res) => {
  const { customer, title, items } = req.body;
  if (!customer) return res.status(400).json({ error: '未选择客户' });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: '询价明细为空' });
  for (const it of items) {
    if (!it.product_number || !String(it.product_number).trim()) {
      return res.status(400).json({ error: '存在缺失 Product Number 的明细行,无法保存' });
    }
  }

  const tx = db.transaction(() => {
    let customerId = customer.id;
    if (!customerId) {
      const name = String(customer.name || '').trim();
      if (!name) throw Object.assign(new Error('新客户名称不能为空'), { status: 400 });
      const existing = db.prepare('SELECT id FROM customers WHERE name = ?').get(name);
      if (existing) {
        customerId = existing.id; // 客户已存在:合并进入其历史数据
      } else {
        customerId = db.prepare(
          'INSERT INTO customers (name, country, contact, email, phone) VALUES (?, ?, ?, ?, ?)'
        ).run(name, customer.country || null, customer.contact || null,
          customer.email || null, customer.phone || null).lastInsertRowid;
      }
    } else if (!db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId)) {
      throw Object.assign(new Error('所选客户不存在'), { status: 404 });
    }

    const inquiryId = db.prepare('INSERT INTO inquiries (customer_id, title) VALUES (?, ?)')
      .run(customerId, title || `询价 ${new Date().toLocaleString('zh-CN')}`).lastInsertRowid;

    const insItem = db.prepare(`
      INSERT INTO inquiry_items (inquiry_id, product_number, product_name, supplier_name, quantity, unit_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insQuote = db.prepare(`
      INSERT INTO quotations (inquiry_item_id, customer_id, product_number, product_name, supplier_name, quantity, unit_price)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const it of items) {
      const pn = String(it.product_number).trim();
      const itemId = insItem.run(inquiryId, pn, it.product_name || null, it.supplier_name || null,
        it.quantity ?? null, it.unit_price ?? null).lastInsertRowid;
      insQuote.run(itemId, customerId, pn, it.product_name || null, it.supplier_name || null,
        it.quantity ?? null, it.unit_price ?? null);
    }
    return { customerId, inquiryId };
  });

  try {
    const out = tx();
    res.status(201).json({ ok: true, customer_id: out.customerId, inquiry_id: out.inquiryId, saved_items: items.length });
  } catch (e) {
    res.status(e.status || 500).json({ error: `数据保存失败: ${e.message}` });
  }
});

// 匹配结果直接导出 Excel(无需先保存询价)
// body: { customer_name, items: [{ product_number, product_name, supplier_name, price, quantity, unit_price, lead_time, weight, remark }] }
router.post('/export', async (req, res) => {
  const { customer_name, items } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: '没有可导出的数据' });
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Quotation');
    ws.columns = [
      { header: 'Product Number', key: 'product_number', width: 18 },
      { header: 'Product Name (CN)', key: 'name_cn', width: 24 },
      { header: 'Product Name (EN)', key: 'name_en', width: 24 },
      { header: 'Supplier', key: 'supplier_name', width: 18 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Unit Price', key: 'unit_price', width: 12 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Lead Time', key: 'lead_time', width: 12 },
      { header: 'Weight', key: 'weight', width: 10 },
      { header: 'Remark', key: 'remark', width: 24 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      ws.addRow({
        product_number: it.product_number,
        name_cn: it.name_cn || it.product_name || '',
        name_en: it.name_en || '',
        supplier_name: it.supplier_name || '',
        quantity: it.quantity ?? '',
        unit_price: it.unit_price ?? '',
        total: qty && price ? +(qty * price).toFixed(2) : '',
        lead_time: it.lead_time || '',
        weight: it.weight ?? '',
        remark: it.remark || '',
      });
    }
    const safeName = String(customer_name || 'quotation').replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
    const fileName = `${safeName}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    res.status(500).json({ error: `导出失败: ${e.message}` });
  }
});

// 客户询价(客户报价库)Excel 导入:解析明细,返回给前端自动填充并匹配
router.post('/import', excelUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未接收到 Excel 文件' });
  try {
    const parsed = await parseInquiryExcel(req.file.path);
    // 若客户名唯一且已建档,返回其 id 供前端自动选中
    let customer = null;
    if (parsed.customer_name) {
      customer = db.prepare('SELECT id, name, country FROM customers WHERE name = ?').get(parsed.customer_name) || null;
    }
    res.json({ ok: true, ...parsed, matched_customer: customer });
  } catch (e) {
    res.status(400).json({ error: `询价导入失败: ${e.message}` });
  }
});

module.exports = router;
