const ExcelJS = require('exceljs');
const path = require('path');

function cellText(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v instanceof Date) return v.toISOString();
    return JSON.stringify(v);
  }
  return String(v);
}

(async () => {
  for (const file of process.argv.slice(2)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    console.log(`\n===== ${path.basename(file)} =====`);
    wb.eachSheet((ws) => {
      console.log(`\n--- Sheet: "${ws.name}" (rows=${ws.rowCount}, cols=${ws.columnCount}) ---`);
      const maxRow = Math.min(ws.rowCount, 25);
      for (let r = 1; r <= maxRow; r++) {
        const row = ws.getRow(r);
        const cells = [];
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          const t = cellText(cell).trim();
          if (t) cells.push(`[${col}]${t}`);
        });
        if (cells.length) console.log(`R${r}: ${cells.join(' | ')}`);
      }
      if (ws.rowCount > 25) console.log(`... (共 ${ws.rowCount} 行,仅显示前 25 行)`);
      // 合并单元格信息
      const merges = ws.model?.merges;
      if (merges && merges.length) console.log('Merges:', merges.slice(0, 20).join(', '));
    });
  }
})().catch((e) => { console.error(e); process.exit(1); });
