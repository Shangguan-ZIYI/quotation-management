import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import ProductDatabase from './pages/ProductDatabase.jsx';
import CustomerInquiry from './pages/CustomerInquiry.jsx';
import CustomerManagement from './pages/CustomerManagement.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import QuotationDatabase from './pages/QuotationDatabase.jsx';

export default function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 className="logo">报价管理系统</h1>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/products">产品总库</NavLink>
          <NavLink to="/inquiry">客户询价</NavLink>
          <NavLink to="/customers">客户管理</NavLink>
          <NavLink to="/quotations">报价数据库</NavLink>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<ProductDatabase />} />
          <Route path="/inquiry" element={<CustomerInquiry />} />
          <Route path="/customers" element={<CustomerManagement />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/quotations" element={<QuotationDatabase />} />
        </Routes>
      </main>
    </div>
  );
}
