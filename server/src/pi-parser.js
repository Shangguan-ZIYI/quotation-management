const ExcelJS = require('exceljs');
const db = require('./db');
const { cellText, cellNumber, normalizePn } = require('./excel-utils');

// ============================================================
// PI(Proforma Invoice)成交识别 —— 按真实 PI 模板实现
// 结构要点:
//   - 表头行含 S.No. | Product Name | Part No. | HS Code | QTY | UNIT PRICE | AMOUNT(CNY)
//   - 表头/数据存在横向合并单元格,取每个表头标签首次出现的列号读取数据
//   - Part No. 带 "OP" 前缀,匹配时自动去除(normalizePn)
//   - Currency 从 AMOUNT 表头括号中识别,如 AMOUNT(CNY) → CNY
//   - Invoice No. 位于表头行之前,标签 "Invoice No" 所在行的最右侧文本
//   - 数据行读取至 "Total Amount" 行为止
// ============================================================

function findPiSheet(wb) {
  let found = null;
  wb.eachSheet((ws) => {
    if (found) return;
    for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
      const row = ws.getRow(r);
      let partNoCol = null;
      const headerCols = {};
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const t = cellText(cell).trim();
        if (!t) return;
        if (partNoCol == null && /part\s*no/i.test(t)) partNoCol = col;
        // 记录各表头标签首次出现的列(合并单元格重复值只取第一列)
        if (headerCols.product_name == null && /product\s*name/i.test(t)) headerCols.product_name = col;
        if (headerCols.qty == null && /^qty$|quantity|数量/i.test(t)) headerCols.qty = col;
        if (headerCols.unit_price == null && /unit\s*price/i.test(t)) headerCols.unit_price = col;
        if (headerCols.amount == null && /amount/i.test(t)) { headerCols.amount = col; headerCols.amountText = t; }
      });
      if (partNoCol != null && headerCols.amount != null) {
        found = { ws, headerRow: r, partNoCol, ...headerCols };
        return;
      }
    }
  });
  return found;
}

function findInvoiceNo(ws, headerRow) {
  for (let r = 1; r < headerRow; r++) {
    const row = ws.getRow(r);
    let hasLabel = false;
    const texts = []; // { col, t }
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const t = cellText(cell).trim();
      if (!t) return;
      if (/invoice\s*no/i.test(t)) hasLabel = true;
      texts.push({ col, t });
    });
    if (!hasLabel) continue;
    // 优先取标签之外最右侧的值;若值写在标签同格(冒号后),从标签中提取
    const nonLabel = texts.filter(({ t }) => !/invoice\s*no/i.test(t));
    if (nonLabel.length) return nonLabel[nonLabel.length - 1].t;
    const m = texts.map(({ t }) => t).join(' ').match(/invoice\s*no\.?\s*[:：]?\s*(\S+)/i);
    if (m && m[1]) return m[1];
  }
  return null;
}

async function parsePiWorkbook(filePath) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(filePath);
  } catch (e) {
    throw new Error(`PI 文件无法读取(需为 .xlsx 格式): ${e.message}`);
  }

  const sheet = findPiSheet(wb);
  if (!sheet) {
    throw new Error('PI 模板不正确:未找到包含 "Part No." 和 "AMOUNT" 表头的工作表');
  }
  const { ws, headerRow, partNoCol, product_name, qty, unit_price, amount, amountText } = sheet;

  // Currency:AMOUNT(CNY) 括号内货币代码
  let currency = null;
  const cm = String(amountText || '').match(/[（(]\s*([A-Za-z]{3})\s*[)）]/);
  if (cm) currency = cm[1].toUpperCase();

  const invoiceNo = findInvoiceNo(ws, headerRow);

  const lines = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rowJoined = [];
    row.eachCell({ includeEmpty: false }, (cell) => rowJoined.push(cellText(cell)));
    if (/total\s*amount/i.test(rowJoined.join(' '))) break; // 合计行终止

    const partRaw = cellText(row.getCell(partNoCol)).trim();
    if (!partRaw) continue;
    lines.push({
      part_no_raw: partRaw,
      product_number: normalizePn(partRaw),
      product_name: product_name ? cellText(row.getCell(product_name)).trim() || null : null,
      quantity: qty ? cellNumber(row.getCell(qty)) : null,
      unit_price: unit_price ? cellNumber(row.getCell(unit_price)) : null,
      amount: cellNumber(row.getCell(amount)),
    });
  }

  if (!lines.length) throw new Error('PI 中未读取到任何含 Part No. 的明细行');
  return { lines, currency, invoiceNo };
}

async function parsePiAndMatch(filePath, customerId, piId) {
  const itemRows = db.prepare(`
    SELECT ii.id, ii.product_number FROM inquiry_items ii
    JOIN inquiries i ON ii.inquiry_id = i.id
    WHERE i.customer_id = ?
  `).all(customerId);
  if (!itemRows.length) {
    throw new Error('该客户没有历史询价记录,无法进行 PI 成交匹配');
  }

  const { lines, currency, invoiceNo } = await parsePiWorkbook(filePath);

  // 客户历史件号(规范化后)→ 原始件号集合
  const known = new Map();
  for (const r of itemRows) {
    const key = normalizePn(r.product_number);
    if (!known.has(key)) known.set(key, r.product_number);
  }

  // PI 行按规范化件号聚合(同件号多行金额累加)
  const hits = new Map(); // normalizedPn -> { deal_total, quantity }
  const unmatched = [];
  for (const ln of lines) {
    const key = normalizePn(ln.product_number);
    if (known.has(key)) {
      const prev = hits.get(key) || { deal_total: 0, quantity: 0, hasTotal: false };
      hits.set(key, {
        deal_total: prev.deal_total + (ln.amount || 0),
        quantity: prev.quantity + (ln.quantity || 0),
        hasTotal: prev.hasTotal || ln.amount != null,
      });
    } else {
      unmatched.push(ln.part_no_raw);
    }
  }

  if (invoiceNo || currency) {
    db.prepare('UPDATE pi_uploads SET invoice_no = COALESCE(?, invoice_no), currency = COALESCE(?, currency) WHERE id = ?')
      .run(invoiceNo || null, currency || null, piId);
  }

  if (!hits.size) {
    return {
      currency,
      invoice_no: invoiceNo,
      matched: [],
      summary: {
        matched_count: 0, currency, invoice_no: invoiceNo,
        unmatched_part_nos: unmatched,
        note: 'PI 中未识别到与该客户历史询价匹配的 Part No.(已自动忽略 OP 前缀)',
      },
    };
  }

  // 同步更新:客户历史询价 + Quotation Database(件号匹配同样忽略 OP 前缀)
  const updateItem = db.prepare(`
    UPDATE inquiry_items SET deal_status = 'deal', deal_total = ?, deal_currency = ?, pi_id = ?
    WHERE id = ?
  `);
  const findQuotes = db.prepare('SELECT id, product_number FROM quotations WHERE customer_id = ?');
  const updateQuote = db.prepare(`
    UPDATE quotations SET deal_status = 'deal', deal_total = ?, deal_currency = ?, pi_id = ?
    WHERE id = ?
  `);

  const matched = [];
  const tx = db.transaction(() => {
    const quoteRows = findQuotes.all(customerId);
    for (const [key, info] of hits.entries()) {
      const dealTotal = info.hasTotal ? +info.deal_total.toFixed(2) : null;
      for (const r of itemRows) {
        if (normalizePn(r.product_number) === key) updateItem.run(dealTotal, currency, piId, r.id);
      }
      for (const q of quoteRows) {
        if (normalizePn(q.product_number) === key) updateQuote.run(dealTotal, currency, piId, q.id);
      }
      matched.push({ product_number: known.get(key), deal_total: dealTotal, quantity: info.quantity || null, currency });
    }
  });
  tx();

  return {
    currency,
    invoice_no: invoiceNo,
    matched,
    summary: {
      matched_count: matched.length,
      currency,
      invoice_no: invoiceNo,
      products: matched.map((m) => m.product_number),
      unmatched_part_nos: unmatched,
    },
  };
}

module.exports = { parsePiAndMatch };
