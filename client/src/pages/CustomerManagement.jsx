import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const emptyCustomer = { name: '', country: '', contact: '', email: '', phone: '', remark: '' };

export default function CustomerManagement() {
  const [customers, setCustomers] = useState([]);
  const [countries, setCountries] = useState([]);
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [msg, setMsg] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyCustomer);

  const load = (query = q, ctry = country) => {
    api.get(`/api/customers?q=${encodeURIComponent(query)}&country=${encodeURIComponent(ctry)}`)
      .then(setCustomers)
      .catch((e) => setMsg({ type: 'error', text: e.message }));
    api.get('/api/customers/countries').then(setCountries).catch(() => {});
  };
  useEffect(() => { load('', ''); }, []);

  const create = async () => {
    try {
      await api.post('/api/customers', form);
      setMsg({ type: 'success', text: `客户 ${form.name} 已创建` });
      setShowAdd(false);
      setForm(emptyCustomer);
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`确认删除客户 ${c.name} 及其全部询价/成交数据?`)) return;
    try {
      await api.del(`/api/customers/${c.id}`);
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div>
      <h2>客户管理 Customer Management</h2>
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
      <div className="toolbar">
        <input placeholder="Customer Name 搜索" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          style={{ width: 240 }} />
        <select value={country} onChange={(e) => { setCountry(e.target.value); load(q, e.target.value); }}>
          <option value="">全部国家</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => load()}>搜索</button>
        <button onClick={() => { setQ(''); setCountry(''); load('', ''); }}>重置</button>
        <div style={{ flex: 1 }} />
        <button className="primary" onClick={() => setShowAdd(true)}>+ 新增客户</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Customer Name</th><th>Country</th><th>联系人</th><th>Email</th><th>电话</th><th>创建时间</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {customers.length === 0 && <tr><td colSpan={7} className="muted">暂无客户</td></tr>}
          {customers.map((c) => (
            <tr key={c.id}>
              <td><Link to={`/customers/${c.id}`}><b>{c.name}</b></Link></td>
              <td>{c.country || '-'}</td>
              <td>{c.contact || '-'}</td>
              <td>{c.email || '-'}</td>
              <td>{c.phone || '-'}</td>
              <td className="nowrap muted">{c.created_at}</td>
              <td className="nowrap">
                <Link to={`/customers/${c.id}`}><button className="small">打开详情</button></Link>{' '}
                <button className="small danger" onClick={() => remove(c)}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showAdd && (
        <div className="modal-mask" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>新增客户</h3>
            <div className="form-grid">
              <label>Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <label>Country</label>
              <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="如 Indonesia / Canada / USA" />
              <label>联系人</label>
              <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              <label>Email</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <label>电话</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <label>Remark</label>
              <textarea rows={2} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowAdd(false)}>取消</button>
              <button className="primary" onClick={create}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
