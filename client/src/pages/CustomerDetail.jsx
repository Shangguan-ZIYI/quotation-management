import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';

export default function CustomerDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [sort, setSort] = useState('deal_qty');
  const [statusFilter, setStatusFilter] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const piRef = useRef();

  const load = (s = sort) => {
    api.get(`/api/customers/${id}/detail?sort=${s}`)
      .then(setData)
      .catch((e) => setMsg({ type: 'error', text: e.message }));
  };
  useEffect(() => { load(); }, [id]);

  const changeSort = (s) => { setSort(s); load(s); };

  const uploadPi = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await api.upload(`/api/customers/${id}/pi`, file);
      const list = (r.matched || []).map((m) => `${m.product_number} → 成交总价 ${m.deal_total ?? '?'} ${m.currency || ''}`);
      setMsg({
        type: r.matched && r.matched.length ? 'success' : 'info',
        text: r.matched && r.matched.length
          ? `PI 识别完成,${r.matched.length} 个 Product Number 已标记成交(客户档案与报价数据库已同步更新):\n${list.join('\n')}`
          : (r.summary?.note || 'PI 已上传,但未识别到匹配的成交件号'),
      });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
      piRef.current.value = '';
    }
  };

  if (!data) {
    return (
      <div>
        <h2>客户详情</h2>
        {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
        <p className="muted">加载中…</p>
      </div>
    );
  }

  const { customer, items, dealSummary, piList } = data;
  const filteredItems = statusFilter ? items.filter((it) => it.deal_status === statusFilter) : items;

  return (
    <div>
      <div className="toolbar">
        <Link to="/customers"><button>← 返回客户列表</button></Link>
      </div>
      <h2>客户详情:{customer.name}</h2>
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

      <div className="card">
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <span><b>Country:</b> {customer.country || '-'}</span>
          <span><b>联系人:</b> {customer.contact || '-'}</span>
          <span><b>Email:</b> {customer.email || '-'}</span>
          <span><b>电话:</b> {customer.phone || '-'}</span>
          <div style={{ flex: 1 }} />
          <button className="primary" onClick={() => piRef.current.click()} disabled={busy}>
            {busy ? '识别中…' : 'Upload PI / 上传 PI'}
          </button>
          <input ref={piRef} type="file" accept=".xlsx,.xls,.csv,.pdf" hidden
            onChange={(e) => uploadPi(e.target.files[0])} />
        </div>
      </div>

      <div className="card">
        <h3>历史询价 History Inquiries({items.length} 条)</h3>
        <div className="toolbar">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部记录</option>
            <option value="deal">已成交</option>
            <option value="pending">未成交</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>询价时间</th>
              <th>Product Number</th>
              <th>Product Name</th>
              <th>Supplier</th>
              <th className="right">Quantity</th>
              <th className="right">Unit Price</th>
              <th>成交状态</th>
              <th className="right">成交总价</th>
              <th>Currency</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 && <tr><td colSpan={9} className="muted">暂无记录</td></tr>}
            {filteredItems.map((it) => (
              <tr key={it.id}>
                <td className="nowrap muted">{it.inquiry_date}</td>
                <td className="nowrap"><b>{it.product_number}</b></td>
                <td>{it.product_name || '-'}</td>
                <td>{it.supplier_name || '-'}</td>
                <td className="right">{it.quantity ?? '-'}</td>
                <td className="right">{it.unit_price ?? '-'}</td>
                <td>
                  {it.deal_status === 'deal'
                    ? <span className="badge deal">已成交</span>
                    : <span className="badge pending">未成交</span>}
                </td>
                <td className="right">{it.deal_total ?? '-'}</td>
                <td>{it.deal_currency || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>成交汇总 Deal Summary(按 Product Number 汇总)</h3>
        <div className="toolbar">
          <span className="muted">排序方式:</span>
          <button className={sort === 'deal_qty' ? 'primary' : ''} onClick={() => changeSort('deal_qty')}>按成交量排序</button>
          <button className={sort === 'deal_total' ? 'primary' : ''} onClick={() => changeSort('deal_total')}>按成交总价排序</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Product Number</th>
              <th>Product Name</th>
              <th className="right">成交量合计</th>
              <th className="right">成交总价合计</th>
              <th>Currency</th>
              <th className="right">成交笔数</th>
            </tr>
          </thead>
          <tbody>
            {dealSummary.length === 0 && <tr><td colSpan={6} className="muted">暂无成交记录</td></tr>}
            {dealSummary.map((d) => (
              <tr key={d.product_number}>
                <td className="nowrap"><b>{d.product_number}</b></td>
                <td>{d.product_name || '-'}</td>
                <td className="right">{d.total_deal_qty ?? '-'}</td>
                <td className="right">{d.total_deal_amount ?? '-'}</td>
                <td>{d.deal_currency || '-'}</td>
                <td className="right">{d.deal_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>已上传 PI({piList.length})</h3>
        <table>
          <thead>
            <tr><th>文件名</th><th>Invoice No.</th><th>Currency</th><th>上传时间</th></tr>
          </thead>
          <tbody>
            {piList.length === 0 && <tr><td colSpan={4} className="muted">尚未上传 PI</td></tr>}
            {piList.map((p) => (
              <tr key={p.id}>
                <td><a href={p.file_path} target="_blank" rel="noreferrer">{p.file_name}</a></td>
                <td>{p.invoice_no || '-'}</td>
                <td>{p.currency || '-'}</td>
                <td className="nowrap muted">{p.uploaded_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
