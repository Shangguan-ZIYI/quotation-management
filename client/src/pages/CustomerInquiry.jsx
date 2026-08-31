import { useEffect, useRef, useState } from 'react';
import { api, downloadExport } from '../api.js';

export default function CustomerInquiry() {
  const [customers, setCustomers] = useState([]);
  const [customerMode, setCustomerMode] = useState('existing'); // existing | new
  const [customerId, setCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', country: '' });
  const [inputItems, setInputItems] = useState([{ product_number: '', quantity: '' }]);
  const [results, setResults] = useState(null); // 匹配结果
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const importRef = useRef();

  useEffect(() => {
    api.get('/api/customers').then(setCustomers).catch((e) => setMsg({ type: 'error', text: e.message }));
  }, []);

  const setItem = (i, patch) =>
    setInputItems(inputItems.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const matchItems = async (items) => {
    if (!items.length) {
      setMsg({ type: 'error', text: '请先输入至少一行 Product Number' });
      return;
    }
    setBusy(true);
    try {
      const r = await api.post('/api/inquiries/match', { items });
      const rows = r.results.map((row) => {
        const best = row.suppliers[0];
        return {
          ...row,
          selected_supplier_id: best ? best.id : null,
          unit_price: row.unit_price != null ? row.unit_price
            : (best && best.price != null ? best.price : ''),
        };
      });
      setResults(rows);
      const unmatched = rows.filter((x) => !x.matched).length;
      setMsg({
        type: unmatched ? 'info' : 'success',
        text: `匹配完成:${rows.length - unmatched} 行匹配成功${unmatched ? `,${unmatched} 行未在总库中找到` : ''}(件号匹配自动忽略 OP 前缀)`,
      });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const doMatch = () =>
    matchItems(inputItems
      .filter((x) => x.product_number.trim())
      .map((x) => ({
        product_number: x.product_number.trim(),
        quantity: x.quantity === '' ? null : Number(x.quantity),
        unit_price: x.unit_price ?? null,
      })));

  const selectSupplier = (rowIdx, sup) => {
    setResults(results.map((r, i) =>
      i === rowIdx ? { ...r, selected_supplier_id: sup.id, unit_price: sup.price ?? r.unit_price } : r
    ));
  };

  const updateResult = (rowIdx, patch) =>
    setResults(results.map((r, i) => (i === rowIdx ? { ...r, ...patch } : r)));

  const buildExportItems = () =>
    results.map((r) => {
      const sup = r.suppliers.find((s) => s.id === r.selected_supplier_id);
      return {
        product_number: r.product_number,
        name_cn: r.name_cn,
        name_en: r.name_en,
        supplier_name: sup ? sup.supplier_name : '',
        quantity: r.quantity,
        unit_price: r.unit_price === '' ? null : Number(r.unit_price),
        lead_time: sup ? sup.lead_time : '',
        weight: r.weight,
        remark: r.remark,
      };
    });

  const customerName = () => {
    if (customerMode === 'existing') {
      const c = customers.find((x) => String(x.id) === String(customerId));
      return c ? c.name : '';
    }
    return newCustomer.name.trim();
  };

  const doExport = async () => {
    if (!results || !results.length) {
      setMsg({ type: 'error', text: '请先执行匹配,再导出' });
      return;
    }
    try {
      await downloadExport('/api/inquiries/export', {
        customer_name: customerName() || 'quotation',
        items: buildExportItems(),
      });
      setMsg({ type: 'success', text: '导出成功(导出不要求先保存询价)' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const doSave = async () => {
    if (!results || !results.length) {
      setMsg({ type: 'error', text: '请先执行匹配,再保存' });
      return;
    }
    let customer;
    if (customerMode === 'existing') {
      if (!customerId) { setMsg({ type: 'error', text: '请选择客户' }); return; }
      customer = { id: Number(customerId) };
    } else {
      if (!newCustomer.name.trim()) { setMsg({ type: 'error', text: '请输入新客户名称' }); return; }
      customer = { name: newCustomer.name.trim(), country: newCustomer.country.trim() || null };
    }
    const withMissing = results.filter((r) => !r.product_number);
    if (withMissing.length) {
      setMsg({ type: 'error', text: '存在 Product Number 缺失的行,无法保存' });
      return;
    }
    setBusy(true);
    try {
      const items = results.map((r) => {
        const sup = r.suppliers.find((s) => s.id === r.selected_supplier_id);
        return {
          product_number: r.product_number,
          product_name: r.name_cn || r.name_en || null,
          supplier_name: sup ? sup.supplier_name : null,
          quantity: r.quantity,
          unit_price: r.unit_price === '' ? null : Number(r.unit_price),
        };
      });
      const out = await api.post('/api/inquiries', { customer, items });
      setMsg({
        type: 'success',
        text: `询价已保存:已写入客户历史档案,并同步写入报价数据库(共 ${out.saved_items} 行)`,
      });
      if (customerMode === 'new') {
        const list = await api.get('/api/customers');
        setCustomers(list);
        setCustomerMode('existing');
        setCustomerId(String(out.customer_id));
      }
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const importExcel = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await api.upload('/api/inquiries/import', file);
      const rows = r.items.map((it) => ({
        product_number: it.product_number,
        quantity: it.quantity ?? '',
        unit_price: it.unit_price ?? null,
      }));
      setInputItems(rows.length ? rows : [{ product_number: '', quantity: '' }]);
      // 客户自动选择:已建档则选中,未建档则预填新客户名
      if (r.matched_customer) {
        setCustomerMode('existing');
        setCustomerId(String(r.matched_customer.id));
      } else if (r.customer_name) {
        setCustomerMode('new');
        setNewCustomer({ name: r.customer_name, country: '' });
      }
      await matchItems(rows.map((x) => ({
        product_number: x.product_number,
        quantity: x.quantity === '' ? null : Number(x.quantity),
        unit_price: x.unit_price,
      })));
      setMsg({
        type: 'success',
        text: `Excel 导入 ${rows.length} 行并已自动匹配${r.customer_name ? `,客户:${r.customer_name}${r.matched_customer ? '(已选中)' : '(新客户,保存时自动建档)'}` : ''}`,
      });
    } catch (e) {
      setMsg({ type: 'error', text: `Excel 导入失败: ${e.message}` });
    } finally {
      setBusy(false);
      importRef.current.value = '';
    }
  };

  return (
    <div>
      <h2>客户询价 Customer Inquiry</h2>
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

      <div className="card">
        <h3>1. 选择客户 Customer Selector</h3>
        <div className="toolbar">
          <label>
            <input type="radio" checked={customerMode === 'existing'}
              onChange={() => setCustomerMode('existing')} /> 现有客户
          </label>
          <label>
            <input type="radio" checked={customerMode === 'new'}
              onChange={() => setCustomerMode('new')} /> 创建新客户
          </label>
          {customerMode === 'existing' ? (
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ minWidth: 220 }}>
              <option value="">-- 选择客户 --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.country ? ` (${c.country})` : ''}</option>
              ))}
            </select>
          ) : (
            <>
              <input placeholder="Customer Name *" value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
              <input placeholder="Country" value={newCustomer.country}
                onChange={(e) => setNewCustomer({ ...newCustomer, country: e.target.value })} />
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h3>2. 询价明细(手动录入 或 Excel 导入)</h3>
        <table>
          <thead>
            <tr><th style={{ width: 260 }}>Product Number</th><th style={{ width: 140 }}>Quantity</th><th></th></tr>
          </thead>
          <tbody>
            {inputItems.map((it, i) => (
              <tr key={i}>
                <td><input value={it.product_number} style={{ width: '100%' }}
                  onChange={(e) => setItem(i, { product_number: e.target.value })} /></td>
                <td><input type="number" value={it.quantity} style={{ width: '100%' }}
                  onChange={(e) => setItem(i, { quantity: e.target.value })} /></td>
                <td>
                  <button className="small danger"
                    onClick={() => setInputItems(inputItems.filter((_, j) => j !== i))}
                    disabled={inputItems.length === 1}>删行</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="toolbar mt">
          <button onClick={() => setInputItems([...inputItems, { product_number: '', quantity: '' }])}>+ 加一行</button>
          <button onClick={() => importRef.current.click()}>Excel 导入询价</button>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" hidden
            onChange={(e) => importExcel(e.target.files[0])} />
          <div style={{ flex: 1 }} />
          <button className="primary" onClick={doMatch} disabled={busy}>匹配产品总库 →</button>
        </div>
      </div>

      {results && (
        <div className="card">
          <h3>3. 匹配结果(同一件号多个供应商时全部显示,可选择)</h3>
          <table>
            <thead>
              <tr>
                <th>状态</th>
                <th>Product Number</th>
                <th>Product Name</th>
                <th>Supplier(选择)</th>
                <th className="right">Quantity</th>
                <th className="right">Unit Price</th>
                <th className="right">小计</th>
                <th className="right">Weight</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>
                    {r.matched
                      ? <span className="badge deal">已匹配</span>
                      : <span className="badge unmatched">{r.error || '未匹配'}</span>}
                  </td>
                  <td className="nowrap"><b>{r.product_number || '-'}</b></td>
                  <td>{r.matched ? <>{r.name_cn || '-'}<br /><span className="muted">{r.name_en || ''}</span></> : '-'}</td>
                  <td>
                    {r.suppliers.length === 0 && <span className="muted">无供应商数据</span>}
                    {r.suppliers.map((s) => (
                      <label className="supplier-option" key={s.id}>
                        <input type="radio" name={`sup-${i}`}
                          checked={r.selected_supplier_id === s.id}
                          onChange={() => selectSupplier(i, s)} />
                        <span>{s.supplier_name}</span>
                        <span className="muted">价格 {s.price ?? '-'} / 交期 {s.lead_time || '-'}</span>
                      </label>
                    ))}
                  </td>
                  <td className="right">
                    <input type="number" style={{ width: 90 }} value={r.quantity ?? ''}
                      onChange={(e) => updateResult(i, { quantity: e.target.value === '' ? null : Number(e.target.value) })} />
                  </td>
                  <td className="right">
                    <input type="number" style={{ width: 100 }} value={r.unit_price ?? ''}
                      onChange={(e) => updateResult(i, { unit_price: e.target.value })} />
                  </td>
                  <td className="right">
                    {r.quantity && r.unit_price ? (Number(r.quantity) * Number(r.unit_price)).toFixed(2) : '-'}
                  </td>
                  <td className="right">{r.weight ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="toolbar mt">
            <button className="success" onClick={doExport}>直接导出 Excel(无需保存)</button>
            <div style={{ flex: 1 }} />
            <span className="muted">是否保存本次询价:</span>
            <button className="primary" onClick={doSave} disabled={busy}>保存(写入客户档案 + 报价数据库)</button>
            <button onClick={() => { setResults(null); setInputItems([{ product_number: '', quantity: '' }]); setMsg({ type: 'info', text: '本次询价未保存,已清空。' }); }}>
              不保存,清空本次询价
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
