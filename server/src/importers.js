const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const db = require('./db');
const { cellText, cellNumber, normalizePn } = require('./excel-utils');

// ============================================================
// Template 1:总库(供应商库)Excel 导入
// 列结构(按表头文字识别,不依赖列顺序):
//   件号 | 品名 | 描述 | 供应商 | 未税价 | 含税运价 | 重量 | 备注 | 实物图
// 同一件号多行 = 多供应商;实物图为 Excel 内嵌图片,按行锚点提取
// ============================================================

function findSheetByHeaders(wb, requiredKeywords) {
  let found = null;
  wb.eachSheet((ws) => {
    if (found) return;
    for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
      const texts = [];
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => texts.push(cellText(cell).trim()));
      const joined = texts.join('|');
      if (requiredKeywords.every((k) => joined.includes(k))) {
        found = { ws, headerRow: r, headers: texts };
        return;
      }
    }
  });
  return found;
}

function mapHeaderColumns(ws, headerRow, mapping) {
  const cols = {};
  ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const t = cellText(cell).trim();
    for (const [key, patterns] of Object.entries(mapping)) {
      if (cols[key] == null && patterns.some((p) => (p instanceof RegExp ? p.test(t) : t.includes(p)))) {
        cols[key] = colNumber;
      }
    }
  });
  return cols;
}

async function importProductExcel(filePath) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(filePath);
  } catch (e) {
    throw new Error(`Excel 无法读取: ${e.message}`);
  }

  const sheetInfo = findSheetByHeaders(wb, ['件号', '供应商']);
  if (!sheetInfo) {
    throw new Error('Excel 模板不正确:未找到包含"件号"和"供应商"表头的工作表(供应商库)');
  }
  const { ws, headerRow } = sheetInfo;

  const cols = mapHeaderColumns(ws, headerRow, {
    product_number: ['件号'],
    name_cn: ['品名'],
    description: ['描述'],
    supplier: ['供应商'],
    price_ex_tax: ['未税价'],
    price: ['含税运价', '含税价'],
    weight: ['重量'],
    remark: ['备注'],
    image: ['实物图', '图片'],
  });
  if (cols.product_number == null) throw new Error('Excel 模板不正确:缺少"件号"列');

  // 内嵌图片:按锚点行归属产品行
  const rowImages = new Map(); // excelRow(1-based) -> { buffer, extension }
  try {
    for (const img of ws.getImages()) {
      const media = wb.getImage(img.imageId);
      if (media && media.buffer) {
        rowImages.set(Math.round(img.range.tl.nativeRow) + 1, media);
      }
    }
  } catch { /* 图片提取失败不阻断数据导入 */ }

  const imagesDir = path.join(require('./paths').uploadsDir, 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  const getProduct = db.prepare('SELECT * FROM products WHERE product_number = ?');
  const insProduct = db.prepare(`
    INSERT INTO products (product_number, name_cn, description, weight, remark)
    VALUES (?, ?, ?, ?, ?)
  `);
  const updProduct = db.prepare(`
    UPDATE products SET
      name_cn = COALESCE(?, name_cn),
      description = COALESCE(?, description),
      weight = COALESCE(?, weight),
      remark = COALESCE(?, remark),
      updated_at = datetime('now','localtime')
    WHERE id = ?
  `);
  const getSupplier = db.prepare('SELECT id FROM product_suppliers WHERE product_id = ? AND supplier_name = ?');
  const insSupplier = db.prepare(`
    INSERT INTO product_suppliers (product_id, supplier_name, price, price_ex_tax)
    VALUES (?, ?, ?, ?)
  `);
  const updSupplier = db.prepare(`
    UPDATE product_suppliers SET
      price = COALESCE(?, price),
      price_ex_tax = COALESCE(?, price_ex_tax)
    WHERE id = ?
  `);
  const setImage = db.prepare("UPDATE products SET image_path = ?, updated_at = datetime('now','localtime') WHERE id = ?");

  const summary = { products_created: 0, products_updated: 0, suppliers_created: 0, suppliers_updated: 0, images_imported: 0, skipped_rows: [] };

  const tx = db.transaction(() => {
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const pnRaw = cellText(row.getCell(cols.product_number)).trim();
      if (!pnRaw) continue; // 空行跳过
      const pn = normalizePn(pnRaw);

      const nameCn = cols.name_cn ? cellText(row.getCell(cols.name_cn)).trim() || null : null;
      const description = cols.description ? cellText(row.getCell(cols.description)).trim() || null : null;
      const weight = cols.weight ? cellNumber(row.getCell(cols.weight)) : null;
      const remark = cols.remark ? cellText(row.getCell(cols.remark)).trim() || null : null;
      const supplierName = cols.supplier ? cellText(row.getCell(cols.supplier)).trim() : '';
      const price = cols.price ? cellNumber(row.getCell(cols.price)) : null;
      const priceExTax = cols.price_ex_tax ? cellNumber(row.getCell(cols.price_ex_tax)) : null;

      // 产品 upsert(同件号多供应商行会命中已存在产品)
      let product = getProduct.get(pn);
      if (!product) {
        const pid = insProduct.run(pn, nameCn, description, weight, remark).lastInsertRowid;
        product = { id: pid };
        summary.products_created++;
      } else {
        updProduct.run(nameCn, description, weight, remark, product.id);
        summary.products_updated++;
      }

      // 供应商 upsert
      if (supplierName) {
        const existing = getSupplier.get(product.id, supplierName);
        if (existing) {
          updSupplier.run(price, priceExTax, existing.id);
          summary.suppliers_updated++;
        } else {
          insSupplier.run(product.id, supplierName, price, priceExTax);
          summary.suppliers_created++;
        }
      } else {
        summary.skipped_rows.push({ row: r, reason: '供应商为空,仅更新产品信息' });
      }

      // 行内嵌图片
      const media = rowImages.get(r);
      if (media) {
        const fileName = `import_${pn}_${Date.now()}.${media.extension || 'png'}`;
        fs.writeFileSync(path.join(imagesDir, fileName), media.buffer);
        setImage.run(`/uploads/images/${fileName}`, product.id);
        summary.images_imported++;
      }
    }
  });
  tx();
  return summary;
}

// ============================================================
// Template 2:客户询价(客户报价库)Excel 导入
// 列结构(按表头文字识别):
//   客户名 | 件号 | 品名 | 描述 | 数量 | 单价CNY | 单价USD | ...
// 返回明细列表供询价页面自动匹配;若客户名唯一则一并返回
// ============================================================

async function parseInquiryExcel(filePath) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(filePath);
  } catch (e) {
    throw new Error(`Excel 无法读取: ${e.message}`);
  }

  const sheetInfo = findSheetByHeaders(wb, ['件号', '数量']);
  if (!sheetInfo) {
    throw new Error('Excel 模板不正确:未找到包含"件号"和"数量"表头的工作表(客户报价库)');
  }
  const { ws, headerRow } = sheetInfo;

  const cols = mapHeaderColumns(ws, headerRow, {
    customer: ['客户名', '客户'],
    product_number: ['件号'],
    product_name: ['品名'],
    quantity: ['数量'],
    price_cny: ['单价CNY', '单价cny'],
    price_usd: ['单价USD', '单价usd'],
  });
  if (cols.product_number == null) throw new Error('Excel 模板不正确:缺少"件号"列');

  const items = [];
  const customerNames = new Set();

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const pnRaw = cellText(row.getCell(cols.product_number)).trim();
    if (!pnRaw) continue;
    const priceCny = cols.price_cny ? cellNumber(row.getCell(cols.price_cny)) : null;
    const priceUsd = cols.price_usd ? cellNumber(row.getCell(cols.price_usd)) : null;
    items.push({
      product_number: normalizePn(pnRaw),
      product_name: cols.product_name ? cellText(row.getCell(cols.product_name)).trim() || null : null,
      quantity: cols.quantity ? cellNumber(row.getCell(cols.quantity)) : null,
      unit_price: priceCny ?? priceUsd ?? null,
      price_currency: priceCny != null ? 'CNY' : (priceUsd != null ? 'USD' : null),
    });
    if (cols.customer) {
      const cn = cellText(row.getCell(cols.customer)).trim();
      if (cn) customerNames.add(cn);
    }
  }

  if (!items.length) throw new Error('Excel 中未读取到任何含件号的询价明细行');

  return {
    items,
    customer_name: customerNames.size === 1 ? [...customerNames][0] : null,
    customer_names: [...customerNames],
  };
}

module.exports = { importProductExcel, parseInquiryExcel };
