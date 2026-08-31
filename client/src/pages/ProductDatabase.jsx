import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const emptyProduct = { product_number: '', name_cn: '', name_en: '', description: '', weight: '', remark: '' };
const emptySupplier = { supplier_name: '', price: '', price_ex_tax: '', lead_time: '' };

const fmtPrice = (v) => (v == null ? '-' : Number(Number(v).toFixed(2)));

export default function ProductDatabase() {
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState(null); // {type, text}
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyProduct);
  const [formSuppliers, setFormSuppliers] = useState([{ ...emptySupplier }]);
  const [addSupplierFor, setAddSupplierFor] = useState(null); // product object
  const [supForm, setSupForm] = useState(emptySupplier);
  const importRef = useRef();
  const imageRefs = useRef({});

  const load = (query = q) => {
    api.get(`/api/products?q=${encodeURIComponent(query)}`)
      .then(setProducts)
      .catch((e) => setMsg({ type: 'error', text: e.message }));
  };
  useEffect(() => { load(''); }, []);

  const createProduct = async () => {
    try {
      const suppliers = formSuppliers
        .filter((s) => s.supplier_name.trim())
        .map((s) => ({
          ...s,
          price: s.price === '' ? null : Number(s.price),
          price_ex_tax: s.price_ex_tax === '' ? null : Number(s.price_ex_tax),
        }));
      await api.post('/api/products', {
        ...form,
        weight: form.weight === '' ? null : Number(form.weight),
        suppliers,
      });
      setMsg({ type: 'success', text: `产品 ${form.product_number} 已创建` });
      setShowAdd(false);
      setForm(emptyProduct);
      setFormSuppliers([{ ...emptySupplier }]);
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const addSupplier = async () => {
    try {
      await api.post(`/api/products/${addSupplierFor.id}/suppliers`, {
        ...supForm,
        price: supForm.price === '' ? null : Number(supForm.price),
        price_ex_tax: supForm.price_ex_tax === '' ? null : Number(supForm.price_ex_tax),
      });
      setMsg({ type: 'success', text: `已为 ${addSupplierFor.product_number} 添加供应商` });
      setAddSupplierFor(null);
      setSupForm(emptySupplier);
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const deleteProduct = async (p) => {
    if (!window.confirm(`确认删除产品 ${p.product_number} 及其全部供应商信息?`)) return;
    try {
      await api.del(`/api/products/${p.id}`);
      setMsg({ type: 'success', text: '已删除' });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const deleteSupplier = async (p, s) => {
    if (!window.confirm(`确认删除 ${p.product_number} 的供应商 ${s.supplier_name}?`)) return;
    try {
      await api.del(`/api/products/suppliers/${s.id}`);
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const uploadImage = async (p, file) => {
    if (!file) return;
    try {
      await api.upload(`/api/products/${p.id}/image`, file, 'image');
      setMsg({ type: 'success', text: `${p.product_number} 图片已上传` });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: `图片上传失败: ${e.message}` });
    }
  };

  const importExcel = async (file) => {
    if (!file) return;
    try {
      const r = await api.upload('/api/products/import', file);
      const s = r.summary || {};
      setMsg({
        type: 'success',
        text: `导入完成:新建产品 ${s.products_created ?? 0},更新产品 ${s.products_updated ?? 0},新建供应商 ${s.suppliers_created ?? 0},更新供应商 ${s.suppliers_updated ?? 0},图片 ${s.images_imported ?? 0}`,
      });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: `Excel 导入失败: ${e.message}` });
    } finally {
      importRef.current.value = '';
    }
  };

  return (
    <div>
      <h2>产品总库 Product Database</h2>
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
      <div className="toolbar">
        <input
          placeholder="搜索 Product Number / 名称"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          style={{ width: 260 }}
        />
        <button onClick={() => load()}>搜索</button>
        <button onClick={() => { setQ(''); load(''); }}>重置</button>
        <div style={{ flex: 1 }} />
        <button className="primary" onClick={() => setShowAdd(true)}>+ 新增产品</button>
        <button onClick={() => importRef.current.click()}>Excel 导入</button>
        <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" hidden
          onChange={(e) => importExcel(e.target.files[0])} />
      </div>

      <table>
        <thead>
          <tr>
            <th>Image</th>
            <th>Product Number</th>
            <th>Product Name 中文</th>
            <th>Product Name English</th>
            <th>描述</th>
            <th>Supplier</th>
            <th className="right">未税价</th>
            <th className="right">含税运价</th>
            <th>Lead Time</th>
            <th className="right">Weight</th>
            <th>Remark</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {products.length === 0 && (
            <tr><td colSpan={12} className="muted">暂无产品数据</td></tr>
          )}
          {products.map((p) => {
            const rows = p.suppliers.length ? p.suppliers : [null];
            return rows.map((s, i) => (
              <tr key={`${p.id}-${s ? s.id : 'none'}`}>
                {i === 0 && (
                  <>
                    <td rowSpan={rows.length}>
                      {p.image_path
                        ? <img className="thumb" src={p.image_path} alt={p.product_number}
                            onError={(e) => { e.target.style.display = 'none'; }} />
                        : <span className="muted">无图</span>}
                    </td>
                    <td rowSpan={rows.length} className="nowrap"><b>{p.product_number}</b></td>
                    <td rowSpan={rows.length}>{p.name_cn || '-'}</td>
                    <td rowSpan={rows.length}>{p.name_en || '-'}</td>
                    <td rowSpan={rows.length}>{p.description || '-'}</td>
                  </>
                )}
                <td>{s ? s.supplier_name : <span className="muted">无供应商</span>}</td>
                <td className="right">{s ? fmtPrice(s.price_ex_tax) : '-'}</td>
                <td className="right">{s ? fmtPrice(s.price) : '-'}</td>
                <td>{s ? (s.lead_time || '-') : '-'}</td>
                {i === 0 && (
                  <>
                    <td rowSpan={rows.length} className="right">{p.weight ?? '-'}</td>
                    <td rowSpan={rows.length}>{p.remark || '-'}</td>
                    <td rowSpan={rows.length} className="nowrap">
                      <button className="small" onClick={() => setAddSupplierFor(p)}>+供应商</button>{' '}
                      <button className="small" onClick={() => imageRefs.current[p.id]?.click()}>传图</button>
                      <input type="file" accept="image/*" hidden
                        ref={(el) => { imageRefs.current[p.id] = el; }}
                        onChange={(e) => uploadImage(p, e.target.files[0])} />{' '}
                      <button className="small danger" onClick={() => deleteProduct(p)}>删除</button>
                      {s && (
                        <>
                          <br />
                          <button className="small danger" style={{ marginTop: 4 }}
                            onClick={() => deleteSupplier(p, s)}>删此供应商</button>
                        </>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ));
          })}
        </tbody>
      </table>

      {showAdd && (
        <div className="modal-mask" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>新增产品</h3>
            <div className="form-grid">
              <label>Product Number *</label>
              <input value={form.product_number} onChange={(e) => setForm({ ...form, product_number: e.target.value })} />
              <label>名称(中文)</label>
              <input value={form.name_cn} onChange={(e) => setForm({ ...form, name_cn: e.target.value })} />
              <label>Name (English)</label>
              <input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
              <label>描述</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <label>Weight</label>
              <input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
              <label>Remark</label>
              <textarea rows={2} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
            </div>
            <h3>供应商(可多个)</h3>
            {formSuppliers.map((s, i) => (
              <div className="supplier-option" key={i}>
                <input placeholder="Supplier Name" value={s.supplier_name}
                  onChange={(e) => setFormSuppliers(formSuppliers.map((x, j) => j === i ? { ...x, supplier_name: e.target.value } : x))} />
                <input placeholder="未税价" type="number" style={{ width: 90 }} value={s.price_ex_tax}
                  onChange={(e) => setFormSuppliers(formSuppliers.map((x, j) => j === i ? { ...x, price_ex_tax: e.target.value } : x))} />
                <input placeholder="含税运价" type="number" style={{ width: 90 }} value={s.price}
                  onChange={(e) => setFormSuppliers(formSuppliers.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
                <input placeholder="Lead Time" style={{ width: 110 }} value={s.lead_time}
                  onChange={(e) => setFormSuppliers(formSuppliers.map((x, j) => j === i ? { ...x, lead_time: e.target.value } : x))} />
                <button className="small danger" onClick={() => setFormSuppliers(formSuppliers.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button className="small" onClick={() => setFormSuppliers([...formSuppliers, { ...emptySupplier }])}>+ 添加供应商行</button>
            <div className="modal-actions">
              <button onClick={() => setShowAdd(false)}>取消</button>
              <button className="primary" onClick={createProduct}>保存</button>
            </div>
          </div>
        </div>
      )}

      {addSupplierFor && (
        <div className="modal-mask" onClick={() => setAddSupplierFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>为 {addSupplierFor.product_number} 添加供应商</h3>
            <div className="form-grid">
              <label>Supplier Name *</label>
              <input value={supForm.supplier_name} onChange={(e) => setSupForm({ ...supForm, supplier_name: e.target.value })} />
              <label>未税价</label>
              <input type="number" value={supForm.price_ex_tax} onChange={(e) => setSupForm({ ...supForm, price_ex_tax: e.target.value })} />
              <label>含税运价</label>
              <input type="number" value={supForm.price} onChange={(e) => setSupForm({ ...supForm, price: e.target.value })} />
              <label>Lead Time</label>
              <input value={supForm.lead_time} onChange={(e) => setSupForm({ ...supForm, lead_time: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button onClick={() => setAddSupplierFor(null)}>取消</button>
              <button className="primary" onClick={addSupplier}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
