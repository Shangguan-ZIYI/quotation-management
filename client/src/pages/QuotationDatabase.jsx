import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function QuotationDatabase() {
  const [rows, setRows] = useState([]);
  const [customer, setCustomer] = useState('');
  const [pn, setPn] = useState('');
  const [status, setStatus] = useState('');
  const [msg, setMsg] = useState(null);

  const load = (c = customer, p = pn, s = status) => {
    api.get(`/api/quotations?customer=${encodeURIComponent(c)}&product_number=${encodeURIComponent(p)}&status=${encodeURIComponent(s)}`)
      .then(setRows)
      .catch((e) => setMsg({ type: 'error', text: e.message }));
  };
  useEffect(() => { load('', '', ''); }, []);

  return (
    <div>
      <h2>报价数据库 Quotation Database</h2>
      <p className="muted" style={{ marginBottom: 12 }}>所有客户的报价与询价数据统一保存于此。</p>
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
      <div className="toolbar">
        <input placeholder="Customer 搜索" value={customer} style={{ width: 200 }}
          onChange={(e) => setCustomer(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()} />
        <input placeholder="Product Number 搜索" value={pn} style={{ width: 200 }}
          onChange={(e) => setPn(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); load(customer, pn, e.target.value); }}>
          <option value="">全部状态</option>
          <option value="deal">已成交</option>
          <option value="pending">未成交</option>
        </select>
        <button onClick={() => load()}>搜索</button>
        <button onClick={() => { setCustomer(''); setPn(''); setStatus(''); load('', '', ''); }}>重置</button>
        <div style={{ flex: 1 }} />
        <span className="muted">共 {rows.length} 条</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Country</th>
            <th>Product Number</th>
            <th>Product Name</th>
            <th>Supplier</th>
            <th className="right">Quantity</th>
            <th className="right">Unit Price</th>
            <th>成交状态</th>
            <th className="right">成交总价</th>
            <th>Currency</th>
            <th>PI 来源</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={12} className="muted">暂无数据</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td><b>{r.customer_name}</b></td>
              <td>{r.customer_country || '-'}</td>
              <td className="nowrap">{r.product_number}</td>
              <td>{r.product_name || '-'}</td>
              <td>{r.supplier_name || '-'}</td>
              <td className="right">{r.quantity ?? '-'}</td>
              <td className="right">{r.unit_price ?? '-'}</td>
              <td>
                {r.deal_status === 'deal'
                  ? <span className="badge deal">已成交</span>
                  : <span className="badge pending">未成交</span>}
              </td>
              <td className="right">{r.deal_total ?? '-'}</td>
              <td>{r.deal_currency || '-'}</td>
              <td>{r.pi_file_name || '-'}</td>
              <td className="nowrap muted">{r.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
