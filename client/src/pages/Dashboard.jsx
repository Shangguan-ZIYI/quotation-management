import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/dashboard/stats').then(setStats).catch((e) => setError(e.message));
  }, []);

  const cards = [
    { to: '/products', label: '产品总库 Products', key: 'products' },
    { to: '/products', label: '供应商记录 Suppliers', key: 'suppliers' },
    { to: '/customers', label: '客户 Customers', key: 'customers' },
    { to: '/inquiry', label: '询价单 Inquiries', key: 'inquiries' },
    { to: '/quotations', label: '报价记录 Quotations', key: 'quotations' },
    { to: '/quotations', label: '已成交 Deals', key: 'deals' },
  ];

  return (
    <div>
      <h2>Dashboard</h2>
      {error && <div className="msg error">{error}</div>}
      <div className="stat-grid">
        {cards.map((c) => (
          <Link className="stat-card" to={c.to} key={c.label}>
            <div className="num">{stats ? stats[c.key] : '–'}</div>
            <div className="label">{c.label}</div>
          </Link>
        ))}
      </div>
      <div className="card mt">
        <h3>核心业务流程</h3>
        <p className="muted">
          产品总库 → 客户询价 → 匹配产品 → 选择客户 → 导出报价 → 保存询价 → 客户档案 → 报价数据库 → PI 识别 → 成交记录
        </p>
      </div>
    </div>
  );
}
