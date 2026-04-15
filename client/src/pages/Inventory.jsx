import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Inventory({ addToast }) {
  const [inventory, setInventory] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({ doctor_id: '', product_id: '', target_stock: '', current_stock: '' });
  const [lastLog, setLastLog] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);

  const loadLog = () => {
    api.getLastSyncLog().then(setLastLog).catch(console.error);
  };

  const load = () => {
    setLoading(true);
    Promise.all([api.getInventory(), api.getDoctors(), api.getProducts()])
      .then(([inv, docs, prods]) => { 
        setInventory(inv); 
        setDoctors(docs); 
        setProducts(prods); 
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { 
    load(); 
    loadLog();
  }, []);

  const handleSyncSync = async () => {
    setSyncing(true);
    try {
      const res = await api.syncMySQL();
      addToast(res.message || 'Sincronización completada');
      load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSyncing(false);
    }
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
      e.target.value = '';
    }
  };

  const filteredInventory = inventory.filter(item => 
    item.doctor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.product_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="inventory-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventario por Doctor</h1>
          <p className="page-subtitle">Control de muestras y vales asignados</p>
        </div>
        <div className="btn-group">
          <button className="btn btn-secondary" onClick={() => { loadLog(); setShowLogModal(true); }}>🔍 Log de Sync</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Asignar Stock</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">📦 Asignaciones de Stock ({filteredInventory.length})</h2>
          <div className="btn-group">
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              style={{ display: 'none' }} 
              id="excel-upload-inventory" 
              onChange={handleExcelUpload} 
            />
            <label htmlFor="excel-upload-inventory" className="btn btn-secondary">
              📊 Importar Excel
            </label>
            <button className="btn btn-secondary" onClick={handleSyncSync} disabled={syncing}>
              {syncing ? <div className="spinner" style={{width: 14, height: 14}}></div> : '🔄'} Sync Local
            </button>
            <button className="btn btn-primary" onClick={openCreate}>+ Asignar Stock</button>
          </div>
        </div>

        {loading ? (
          <div className="loading-container"><div className="spinner"></div><span>Cargando inventario...</span></div>
        ) : filteredInventory.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Producto</th>
                  <th>Existencia / Objetivo</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map(item => {
                  const isLow = item.current_stock <= (item.target_stock * 0.2);
                  const isCritical = item.current_stock === 0;
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.doctor_name}</td>
                      <td>{item.product_name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                          <span style={{ 
                            fontSize: '16px', 
                            fontWeight: '800', 
                            color: isCritical ? '#ef4444' : isLow ? '#f59e0b' : 'var(--text-primary)' 
                          }}>
                            {item.current_stock}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>/ {item.target_stock} pzas</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <p className="empty-state-text">Sin asignaciones</p>
            <p className="empty-state-hint">Crea una asignación o importa un Excel</p>
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
                    <select 
                      className="form-input" 
                      required 
                      value={form.doctor_id} 
                      onChange={e => setForm({ ...form, doctor_id: e.target.value })}
                    >
                      <option value="">Seleccionar doctor...</option>
                      {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Producto *</label>
                    <select 
                      className="form-input" 
                      required 
                      value={form.product_id} 
                      onChange={e => setForm({ ...form, product_id: e.target.value })}
                    >
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
                  <label className="form-label">Existencia Actual</label>
                  <input className="form-input" type="number" min="0" value={form.current_stock} onChange={e => setForm({ ...form, current_stock: e.target.value })} placeholder="Ej. 5" />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Guardar Cambios' : 'Asignar Stock'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Diagnóstico de Sync */}
      {showLogModal && (
        <div className="modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="modal" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">📊 Última Sincronización (Diagnóstico)</h2>
            {lastLog ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  <div className="card" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold' }}>TOTAL MySQL</div>
                    <div style={{ fontSize: '24px', fontWeight: '800' }}>{lastLog.total_mysql}</div>
                  </div>
                  <div className="card" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold' }}>PRODUCTOS ENCONTRADOS</div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary-color)' }}>{lastLog.matched}</div>
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                    ❌ Muestra de productos sin coincidencia ({JSON.parse(lastLog.unmatched_list || '[]').length}):
                  </h3>
                  <div className="table-wrapper" style={{ maxHeight: '300px' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Nombre en MySQL</th>
                          <th>Código</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(JSON.parse(lastLog.unmatched_list || '[]')).slice(0, 30).map((item, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: '12px' }}>{item.nombre}</td>
                            <td style={{ fontSize: '12px', fontFamily: 'monospace' }}>{item.codigo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="loading-container"><div className="spinner"></div><span>Cargando log...</span></div>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowLogModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
