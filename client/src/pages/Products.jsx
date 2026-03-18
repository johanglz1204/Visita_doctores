import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Products({ addToast }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', presentation: '', laboratory: '', description: '', barcode: '', ranking: '', price: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);

  const load = () => {
    setLoading(true);
    api.getProducts().then(setProducts).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setForm({ name: '', presentation: '', laboratory: '', description: '', barcode: '', ranking: '', price: '' });
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setShowModal(true); };

  const openEdit = (prod) => {
    setForm({ 
      name: prod.name, 
      presentation: prod.presentation || '', 
      laboratory: prod.laboratory || '', 
      description: prod.description || '',
      barcode: prod.barcode || '',
      ranking: prod.ranking || '',
      price: prod.price || ''
    });
    setEditing(prod.id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.updateProduct(editing, form);
        addToast('Producto actualizado');
      } else {
        await api.createProduct(form);
        addToast('Producto creado');
      }
      setShowModal(false);
      resetForm();
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`¿Eliminar el producto ${name}?`)) return;
    try {
      await api.deleteProduct(id);
      addToast('Producto eliminado');
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
      const res = await api.uploadProductsExcel(formData);
      addToast(res.message);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Productos</h1>
          <p className="page-subtitle">Catálogo de medicamentos y muestras médicas</p>
        </div>
        <div className="search-container" style={{ flex: 1, maxWidth: '400px', margin: '0 20px' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Buscar por nombre..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '35px', borderRadius: '20px', background: 'var(--bg-card)' }}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">💊 Lista de Productos ({products.length})</h2>
          <div className="btn-group">
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              style={{ display: 'none' }} 
              id="excel-upload-products" 
              onChange={handleExcelUpload} 
            />
            <label htmlFor="excel-upload-products" className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
              📊 Cargar Excel
            </label>
            <button className="btn btn-primary" onClick={openCreate}>+ Nuevo Producto</button>
          </div>
        </div>

        {loading ? (
          <div className="loading-container"><div className="spinner"></div><span>Cargando...</span></div>
        ) : products.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Código Barras</th>
                  <th>Producto</th>
                  <th>Presentación</th>
                  <th>Laboratorio</th>
                  <th>Ranking</th>
                  <th>Precio</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {products
                  .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(prod => (
                  <tr key={prod.id}>
                    <td style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>{prod.barcode || '—'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{prod.name}</td>
                    <td><span className="badge badge-info">{prod.presentation || '—'}</span></td>
                    <td>{prod.laboratory || '—'}</td>
                    <td><span className={`badge ${prod.ranking === 'AA' || prod.ranking === 'A' ? 'badge-success' : 'badge-warning'}`}>{prod.ranking || '—'}</span></td>
                    <td style={{ fontWeight: 600 }}>${(parseFloat(prod.price) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <div className="btn-group">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(prod)}>✏️ Editar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(prod.id, prod.name)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">💊</div>
            <p className="empty-state-text">No hay productos registrados</p>
            <p className="empty-state-hint">Haz clic en "Nuevo Producto" para agregar uno</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{editing ? '✏️ Editar Producto' : '➕ Nuevo Producto'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Código de Barras</label>
                  <input className="form-input" value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="750123456789" />
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre *</label>
                  <input className="form-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="FARMAPRAM" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Presentación</label>
                  <input className="form-input" value={form.presentation} onChange={e => setForm({ ...form, presentation: e.target.value })} placeholder="0.50 MG" />
                </div>
                <div className="form-group">
                  <label className="form-label">Laboratorio</label>
                  <input className="form-input" value={form.laboratory} onChange={e => setForm({ ...form, laboratory: e.target.value })} placeholder="Productos Medix" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Ranking</label>
                  <input className="form-input" value={form.ranking} onChange={e => setForm({ ...form, ranking: e.target.value })} placeholder="AA, A, B, C" />
                </div>
                <div className="form-group">
                  <label className="form-label">Precio Vale</label>
                  <input type="number" step="0.01" className="form-input" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea className="form-textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descripción del producto..."></textarea>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Guardar Cambios' : 'Crear Producto'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showScrollTop && (
        <button 
          className="btn btn-primary btn-icon" 
          onClick={scrollToTop}
          style={{
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 90
          }}
        >
          ↑
        </button>
      )}
    </div>
  );
}
