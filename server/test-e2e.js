// 端到端 API 测试脚本(UTF-8 安全)
const BASE = 'http://localhost:3001';

async function req(method, url, data) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

(async () => {
  // 清理旧测试数据后重建
  const db = require('./src/db');
  db.exec('DELETE FROM quotations; DELETE FROM inquiry_items; DELETE FROM inquiries; DELETE FROM pi_uploads; DELETE FROM customers; DELETE FROM product_suppliers; DELETE FROM products;');

  // 1. 创建多供应商产品
  let r = await req('POST', '/api/products', {
    product_number: '1234567', name_cn: '线束', name_en: 'Harness', weight: 0.5, remark: '测试产品',
    suppliers: [
      { supplier_name: 'Supplier A', price: 100, lead_time: '15 Days' },
      { supplier_name: 'Supplier B', price: 95, lead_time: '30 Days' },
      { supplier_name: 'Supplier C', price: 110, lead_time: '7 Days' },
    ],
  });
  console.log('1.创建产品:', r.status, r.body.name_cn, '供应商数:', r.body.suppliers.length);

  await req('POST', '/api/products', {
    product_number: '7654321', name_cn: '接头', name_en: 'Connector', weight: 0.1,
    suppliers: [{ supplier_name: 'Supplier A', price: 8, lead_time: '10 Days' }],
  });

  // 2. 匹配(含一个未匹配件号)
  r = await req('POST', '/api/inquiries/match', {
    items: [
      { product_number: '1234567', quantity: 50 },
      { product_number: '7654321', quantity: 200 },
      { product_number: '9999999', quantity: 10 },
    ],
  });
  console.log('2.匹配:', r.status,
    '匹配行:', r.body.results.filter((x) => x.matched).length,
    '未匹配:', r.body.results.filter((x) => !x.matched).length,
    '1234567供应商数:', r.body.results[0].suppliers.length);

  // 3. 保存询价(新客户自动建档)
  r = await req('POST', '/api/inquiries', {
    customer: { name: 'PT Indo Auto', country: 'Indonesia' },
    items: [
      { product_number: '1234567', product_name: '线束', supplier_name: 'Supplier B', quantity: 50, unit_price: 98 },
      { product_number: '7654321', product_name: '接头', supplier_name: 'Supplier A', quantity: 200, unit_price: 9.5 },
    ],
  });
  console.log('3.保存询价(新客户):', r.status, JSON.stringify(r.body));
  const customerId = r.body.customer_id;

  // 4. 再次保存(客户已存在 → 合并历史)
  r = await req('POST', '/api/inquiries', {
    customer: { name: 'PT Indo Auto' },
    items: [{ product_number: '1234567', product_name: '线束', supplier_name: 'Supplier A', quantity: 30, unit_price: 102 }],
  });
  console.log('4.保存询价(已有客户合并):', r.status, 'customer_id相同:', r.body.customer_id === customerId);

  // 5. 报价数据库
  r = await req('GET', '/api/quotations');
  console.log('5.报价数据库记录数:', r.body.length, '未成交:', r.body.filter((x) => x.deal_status === 'pending').length);

  // 6. 客户详情
  r = await req('GET', `/api/customers/${customerId}/detail?sort=deal_qty`);
  console.log('6.客户详情:', r.body.customer.name, r.body.customer.country, '历史询价条数:', r.body.items.length);

  // 7. 客户筛选
  r = await req('GET', '/api/customers?country=Indonesia');
  console.log('7.国家筛选 Indonesia:', r.body.length);

  // 8. 导出
  const res = await fetch(BASE + '/api/inquiries/export', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_name: 'PT Indo Auto',
      items: [{ product_number: '1234567', name_cn: '线束', name_en: 'Harness', supplier_name: 'Supplier B', quantity: 50, unit_price: 98, lead_time: '30 Days', weight: 0.5 }],
    }),
  });
  const buf = await res.arrayBuffer();
  console.log('8.导出:', res.status, 'xlsx字节数:', buf.byteLength);

  // 9. 生成测试 PI 并上传(1234567 成交, USD)
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('PI');
  ws.addRow(['PROFORMA INVOICE']);
  ws.addRow(['Currency', 'USD']);
  ws.addRow(['Item', 'Part No', 'Qty', 'Unit Price', 'Amount']);
  ws.addRow([1, '1234567', 50, 98, 4900]);
  const piPath = require('path').join(__dirname, 'test-pi.xlsx');
  await wb.xlsx.writeFile(piPath);

  const fd = new FormData();
  const fileBuf = require('fs').readFileSync(piPath);
  fd.append('file', new Blob([fileBuf]), 'test-pi.xlsx');
  const piRes = await fetch(`${BASE}/api/customers/${customerId}/pi`, { method: 'POST', body: fd });
  const piBody = await piRes.json();
  console.log('9.PI上传识别:', piRes.status, JSON.stringify(piBody.matched), 'currency:', piBody.currency);

  // 10. 验证成交联动:客户历史 + 报价数据库
  r = await req('GET', `/api/customers/${customerId}/detail?sort=deal_total`);
  const dealItems = r.body.items.filter((x) => x.deal_status === 'deal');
  console.log('10.客户成交条数:', dealItems.length, '成交汇总:', JSON.stringify(r.body.dealSummary));
  r = await req('GET', '/api/quotations?status=deal');
  console.log('11.报价数据库已成交:', r.body.length, r.body.map((x) => `${x.product_number}:${x.deal_total}${x.deal_currency}`).join(','));

  // 12. 中文验证
  const cn = db.prepare('SELECT name_cn FROM products WHERE product_number = ?').get('1234567');
  console.log('12.中文存储:', cn.name_cn, cn.name_cn === '线束' ? 'OK' : 'FAIL');

  require('fs').unlinkSync(piPath);
  console.log('--- 测试完成 ---');
})().catch((e) => { console.error('测试失败:', e); process.exit(1); });
