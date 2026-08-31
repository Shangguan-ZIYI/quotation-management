// Excel 单元格取值与件号规范化工具

function cellText(cell) {
  const v = cell && cell.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text) return String(v.text);
    if (v.result != null) return String(v.result);
    return '';
  }
  return String(v);
}

function cellNumber(cell) {
  const v = cell && cell.value;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof v.result === 'number') return v.result;
  const t = cellText(cell).replace(/[,，\s]/g, '');
  if (t && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return null;
}

// 件号规范化:去除 "OP" 前缀(PI 中件号带 OP 前缀,匹配时自动忽略)
function normalizePn(s) {
  const t = String(s ?? '').trim();
  return t.replace(/^OP/i, '');
}

module.exports = { cellText, cellNumber, normalizePn };
