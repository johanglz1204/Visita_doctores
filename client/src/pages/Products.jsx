import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Products({ addToast }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', barcode: '', ranking: '', price: '' });
  const [searchTerm, setSearchTerm] = useState('');

  const load = () => {
    setLoading(true);
    api.getProducts().then(setProducts).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ name: '', barcode: '', ranking: '', price: '' });
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setShowModal(true); };

  const openEdit = (prod) => {
    setForm({ 
      name: prod.name, 
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

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.barcode && p.barcode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="products-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Productos</h1>
          <p className="page-subtitle">Catálogo de medicamentos y muestras médicas</p>
        </div>
        <div className="search-container" style={{ width: '300px' }}>
          <span>🔍</span>
          <input 
            type="text" 
            placeholder="Buscar por nombre o código..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'none', width: '100%', color: 'var(--text-primary)', outline: 'none' }}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">💊 Lista de Productos ({filteredProducts.length})</h2>
          <div className="btn-group">
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              style={{ display: 'none' }} 
              id="excel-upload-products" 
              onChange={handleExcelUpload} 
            />
            <label htmlFor="excel-upload-products" className="btn btn-secondary">
              📊 Importar
            </label>
            <button className="btn btn-secondary" onClick={() => window.location.href = api.exportProductsExcel()}>📥 Exportar</button>
            <button 
              className="btn btn-secondary" 
              style={{ color: '#d97706', borderColor: '#fbbf24' }} 
              onClick={async () => {
                setLoading(true);
                try {
                  // Primero ver cuántos duplicados hay
                  const preview = await api.getDuplicatesPreview();
                  setLoading(false);
                  
                  if (preview.duplicates_to_delete === 0) {
                    addToast('✅ No hay productos duplicados. El catálogo está limpio.');
                    return;
                  }
                  
                  if (!confirm(
                    `Se encontraron ${preview.duplicates_to_delete} producto(s) duplicados en ${preview.duplicate_groups} grupo(s).\n\n` +
                    `¿Deseas eliminar los duplicados? Los registros de inventario y ventas serán migrados al producto original.`
                  )) return;
                  
                  setLoading(true);
                  const res = await api.cleanupProducts();
                  addToast(res.message);
                  load();
                } catch (err) {
                  addToast(err.message, 'error');
                  setLoading(false);
                } finally {
                  setLoading(false);
                }
              }}
            >
              ✨ Limpiar Duplicados
            </button>

            <button className="btn btn-primary" onClick={openCreate}>+ Nuevo Producto</button>

          </div>
        </div>

        {loading ? (
          <div className="loading-container"><div className="spinner"></div><span>Cargando productos...</span></div>
        ) : filteredProducts.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Ranking</th>
                    <th style={{ textAlign: 'center', backgroundColor: 'rgba(var(--primary-rgb), 0.05)' }}>📦 Existencia Sucursal</th>
                    <th>Precio</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(prod => (
                    <tr key={prod.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{prod.barcode || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{prod.name}</td>
                      <td><span className={`badge ${prod.ranking === 'A' || prod.ranking === 'AA' ? 'badge-success' : 'badge-warning'}`}>{prod.ranking || '—'}</span></td>
                      <td style={{ textAlign: 'center', backgroundColor: 'rgba(var(--primary-rgb), 0.02)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ 
                            fontSize: '18px', 
                            fontWeight: '800', 
                            color: 'var(--primary-color)' 
                          }}>
                            {prod.stock || 0}
                          </span>
                          {prod.updated_at && (
                            <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                              Act: {new Date(prod.updated_at).toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                      </td>
                    <td style={{ fontWeight: 700 }}>${(parseFloat(prod.price) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(prod)}>✏️</button>
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
            <p className="empty-state-text">No se encontraron productos</p>
            <p className="empty-state-hint">Registra un nuevo producto o importa un archivo Excel</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{editing ? '✏️ Editar Producto' : '➕ Nuevo Producto'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre del Producto *</label>
                <input className="form-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. FARMAPRAM" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Código (Barcode)</label>
                  <input className="form-input" value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="750123456789" />
                </div>
                <div className="form-group">
                  <label className="form-label">Ranking</label>
                  <input className="form-input" value={form.ranking} onChange={e => setForm({ ...form, ranking: e.target.value })} placeholder="A, B, C..." />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Precio Vale</label>
                <input type="number" step="0.01" className="form-input" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Guardar Cambios' : 'Crear Producto'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
