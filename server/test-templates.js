// 真实模板端到端测试:清空数据 → 供应商库导入 → 询价导入+匹配 → 保存 → PI 成交识别 → 校验双写同步
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:3001';
const TPL_DIR = path.join(__dirname, '..', '模板');
const SUPPLIER_XLSX = path.join(TPL_DIR, '报价工具模版汇总.xlsx');
const PI_XLSX = path.join(TPL_DIR, 'Proforma Invoice_模版.xlsx');

let step = 0;
function ok(name, cond, extra = '') {
  step++;
  if (!cond) throw new Error(`STEP ${step} FAIL: ${name} ${extra}`);
  console.log(`  ✓ ${step}. ${name}${extra ? ' — ' + extra : ''}`);
}

async function jfetch(url, opts) {
  const res = await fetch(BASE + url, opts);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function fileForm(filePath) {
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  return fd;
}

(async () => {
  console.log('== 真实模板端到端测试 ==');

  // 0. 清空数据
  const db = require('./src/db');
  db.exec('DELETE FROM quotations; DELETE FROM inquiry_items; DELETE FROM pi_uploads; DELETE FROM inquiries; DELETE FROM customers; DELETE FROM product_suppliers; DELETE FROM products;');
  console.log('  (已清空全部数据)');

  // 1. 供应商库导入
  let r = await jfetch('/api/products/import', { method: 'POST', body: fileForm(SUPPLIER_XLSX) });
  ok('供应商库导入成功', r.status === 200 && r.body.ok, JSON.stringify(r.body.summary || r.body));
  const impSummary = r.body.summary;
  ok('导入创建了产品', impSummary.products_created > 0, `products_created=${impSummary.products_created}`);
  ok('导入创建了供应商', impSummary.suppliers_created > 0, `suppliers_created=${impSummary.suppliers_created}`);

  // 2. 产品列表校验多供应商 + 新字段
  r = await jfetch('/api/products');
  const products = r.body;
  ok('产品列表非空', products.length > 0, `count=${products.length}`);
  const multi = products.find((p) => p.suppliers.length > 1);
  console.log(`  (同件号多供应商: ${multi ? multi.product_number : '本模板数据中无,跳过'})`);
  ok('每个产品均有供应商', products.every((p) => p.suppliers.length >= 1));
  const withExTax = products.find((p) => p.suppliers.some((s) => s.price_ex_tax != null));
  ok('未税价字段已导入', !!withExTax);
  const withDesc = products.find((p) => p.description);
  ok('描述字段已导入', !!withDesc, withDesc ? `${withDesc.product_number}: ${withDesc.description}` : '');

  // 3. 询价 Excel 导入解析
  r = await jfetch('/api/inquiries/import', { method: 'POST', body: fileForm(SUPPLIER_XLSX) });
  ok('询价导入解析成功', r.status === 200 && r.body.ok, `items=${(r.body.items || []).length}`);
  const inqItems = r.body.items;
  ok('识别客户名', !!r.body.customer_name, `customer=${r.body.customer_name}`);
  const customerName = r.body.customer_name;

  // 4. 匹配(件号应命中总库)
  r = await jfetch('/api/inquiries/match', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: inqItems }),
  });
  const matched = r.body.results.filter((x) => x.matched);
  ok('询价明细匹配总库', matched.length > 0, `matched=${matched.length}/${r.body.results.length}`);

  // 5. 保存询价(新客户自动建档 + 双写)
  const saveItems = r.body.results.map((x) => ({
    product_number: x.product_number,
    product_name: x.name_cn || x.product_name || null,
    supplier_name: x.suppliers[0] ? x.suppliers[0].supplier_name : null,
    quantity: x.quantity,
    unit_price: x.unit_price,
  }));
  r = await jfetch('/api/inquiries', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer: { name: customerName }, items: saveItems }),
  });
  ok('保存询价成功(自动建档)', r.status === 201 && r.body.ok, `customer_id=${r.body.customer_id}, items=${r.body.saved_items}`);
  const customerId = r.body.customer_id;

  // 6. PI 上传 → 成交识别(OP 前缀忽略)
  r = await jfetch(`/api/customers/${customerId}/pi`, { method: 'POST', body: fileForm(PI_XLSX) });
  ok('PI 解析成功', r.status === 200 && r.body.ok, JSON.stringify(r.body.summary));
  ok('PI 匹配到成交件号(OP 前缀已忽略)', r.body.matched.length > 0, `matched=${r.body.matched.length}`);
  ok('Currency 识别为 CNY', r.body.currency === 'CNY', `currency=${r.body.currency}`);
  ok('Invoice No 识别', !!r.body.invoice_no, `invoice_no=${r.body.invoice_no}`);
  const dealPns = r.body.matched.map((m) => m.product_number);

  // 7. 客户详情:成交状态 + PI 列表含 invoice_no
  r = await jfetch(`/api/customers/${customerId}/detail?sort=deal_total`);
  const dealItems = r.body.items.filter((it) => it.deal_status === 'deal');
  ok('客户历史已标记成交', dealItems.length === 0 ? false : true, `deal_items=${dealItems.length}`);
  ok('成交记录含总价+币种', dealItems.every((it) => it.deal_currency === 'CNY'));
  ok('成交汇总排序返回', r.body.dealSummary.length > 0, `summary_rows=${r.body.dealSummary.length}`);
  ok('PI 列表含 Invoice No', r.body.piList.length > 0 && !!r.body.piList[0].invoice_no, `invoice_no=${r.body.piList[0]?.invoice_no}`);

  // 8. 报价数据库同步校验
  r = await jfetch(`/api/quotations?status=deal`);
  const quotes = Array.isArray(r.body) ? r.body : r.body.rows || [];
  ok('报价数据库同步成交状态', quotes.length === dealItems.length, `quotations_deal=${quotes.length} vs items_deal=${dealItems.length}`);
  ok('成交件号一致', dealPns.every((pn) => quotes.some((q) => q.product_number === pn)));

  console.log(`\n全部 ${step} 项通过 ✔  成交件号: ${dealPns.join(', ')}`);
  process.exit(0);
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
