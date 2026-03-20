import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Inventory({ addToast }) {
  const [inventory, setInventory] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ doctor_id: '', product_id: '', target_stock: '', current_stock: '' });

  const load = () => {
    setLoading(true);
    Promise.all([api.getInventory(), api.getDoctors(), api.getProducts()])
      .then(([inv, docs, prods]) => { setInventory(inv); setDoctors(docs); setProducts(prods); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const getStockClass = (current, target) => {
    if (target === 0) return 'good';
    const pct = (current / target) * 100;
    if (pct > 50) return 'good';
    if (pct > 20) return 'warning';
    return 'danger';
  };

  const getStockBadge = (current, target) => {
    const cls = getStockClass(current, target);
    if (cls === 'good') return 'badge-success';
    if (cls === 'warning') return 'badge-warning';
    return 'badge-danger';
  };

  const openCreate = () => {
    setForm({ doctor_id: '', product_id: '', target_stock: '', current_stock: '' });
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (item) => {
    setForm({
      doctor_id: item.doctor_id,
      product_id: item.product_id,
      target_stock: item.target_stock,
      current_stock: item.current_stock,
    });
    setEditing(item.id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        doctor_id: parseInt(form.doctor_id),
        product_id: parseInt(form.product_id),
        target_stock: parseInt(form.target_stock),
        current_stock: parseInt(form.current_stock || form.target_stock),
      };
      if (editing) {
        await api.updateInventory(editing, payload);
        addToast('Stock actualizado');
      } else {
        await api.createInventory(payload);
        addToast('Asignación de stock creada');
      }
      setShowModal(false);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta asignación de stock?')) return;
    try {
      await api.deleteInventory(id);
      addToast('Asignación eliminada');
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check extension
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      addToast('Solo se permiten archivos de Excel (.xlsx, .xls)', 'error');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.uploadInventoryExcel(formData);
      addToast(res.message);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
      // Reset input
      e.target.value = '';
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Inventario</h1>
        <p className="page-subtitle">Asignación y seguimiento de stock por doctor y producto</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">📦 Asignaciones de Stock ({inventory.length})</h2>
          <div className="btn-group">
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              style={{ display: 'none' }} 
              id="excel-upload" 
              onChange={handleExcelUpload} 
            />
            <label htmlFor="excel-upload" className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
              📊 Cargar Excel
            </label>
            <button className="btn btn-primary" onClick={openCreate}>+ Asignar Stock</button>
          </div>
        </div>

        {loading ? (
          <div className="loading-container"><div className="spinner"></div><span>Cargando...</span></div>
        ) : inventory.length > 0 ? (

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Producto</th>
                  <th>Stock Objetivo</th>
                  <th>Stock Actual</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map(item => {
                  const pct = item.target_stock > 0 ? Math.round((item.current_stock / item.target_stock) * 100) : 100;
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.doctor_name}</td>
                      <td>{item.product_name}</td>
                      <td>{item.target_stock} Pza</td>
                      <td>
                        <strong>{item.current_stock}</strong> Pza
                        <div className="stock-bar-container">
                          <div className={`stock-bar ${getStockClass(item.current_stock, item.target_stock)}`} style={{ width: `${Math.min(pct, 100)}%` }}></div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${getStockBadge(item.current_stock, item.target_stock)}`}>
                          {pct}%
                        </span>
                      </td>
                      <td>
                        <div className="btn-group">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <p className="empty-state-text">No hay asignaciones de stock</p>
            <p className="empty-state-hint">Asigna un stock objetivo por doctor y producto</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{editing ? '✏️ Editar Stock' : '➕ Asignar Stock'}</h2>
            <form onSubmit={handleSubmit}>
              {!editing && (
                <>
                  <div className="form-group">
                    <label className="form-label">Doctor *</label>
                    <select className="form-select" required value={form.doctor_id} onChange={e => setForm({ ...form, doctor_id: e.target.value })}>
                      <option value="">Seleccionar doctor...</option>
                      {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Producto *</label>
                    <select className="form-select" required value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}>
                      <option value="">Seleccionar producto...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Stock Objetivo *</label>
                  <input className="form-input" type="number" required min="0" value={form.target_stock} onChange={e => setForm({ ...form, target_stock: e.target.value })} placeholder="10" />
                </div>
                <div className="form-group">
                  <label className="form-label">Stock Actual</label>
                  <input className="form-input" type="number" min="0" value={form.current_stock} onChange={e => setForm({ ...form, current_stock: e.target.value })} placeholder="Igual al objetivo" />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Guardar' : 'Asignar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
