import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Products({ addToast }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', barcode: '', ranking: '', price: '', transit_stock: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [diagnosticTab, setDiagnosticTab] = useState('unmatched');
  const [rankingFilter, setRankingFilter] = useState('all'); // 'all', 'aa', 'a', 'risk'
  const [branchFilter, setBranchFilter] = useState('all'); // 'all', 'MATRIZ', 'TAMPICO', etc.
  const BRANCHES = ['MATRIZ', 'TAMPICO', 'CIVIL', 'EJERCITO', 'CURVA TEXAS'];
  const [mappingFor, setMappingFor] = useState(null); // nombre MySQL que se está vinculando
  const [mapSearch, setMapSearch] = useState('');
  const [mapResults, setMapResults] = useState([]);
  const [aliases, setAliases] = useState([]);

  const loadAliases = () => {
    api.getAliases().then(data => setAliases(Array.isArray(data) ? data : [])).catch(console.error);
  };

  const loadLog = () => {
    api.syncStatus().then(setData => {
       setSyncInfo(setData);
       // El backend devuelve el historial y el último log en syncStatus
    }).catch(console.error);
  };

  const load = () => {
    setLoading(true);
    api.getProducts().then(setProducts).catch(console.error).finally(() => setLoading(false));
    api.syncStatus().then(setSyncInfo).catch(console.error);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ name: '', barcode: '', ranking: '', price: '', transit_stock: 0 });
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setShowModal(true); };

  const openEdit = (prod) => {
    setForm({ 
      name: prod.name, 
      barcode: prod.barcode || '',
      ranking: prod.ranking || '',
      price: prod.price || '',
      transit_stock: prod.transit_stock || 0
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
  
  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await api.triggerSync();
      addToast(res.message);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };


  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 50;

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.barcode && p.barcode.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!matchesSearch) return false;

    if (branchFilter !== 'all') {
      const branchStock = (p.stock_by_branch || {})[branchFilter] || 0;
      if (branchStock <= 0) return false;
    }

    const r = (p.ranking || '').toLowerCase();
    if (rankingFilter === 'all') return true;
    if (rankingFilter === 'risk') {
      if (branchFilter !== 'all') {
        const bs = (p.stock_by_branch || {})[branchFilter] || 0;
        return (r === 'aa' || r === 'a') && bs <= (p.min_stock || 5);
      }
      return (r === 'aa' || r === 'a') && (p.stock || 0) <= (p.min_stock || 5);
    }
    
    return r === rankingFilter;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
  const indexOfLastProduct = currentPage * productsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
  const currentProducts = filteredProducts.slice(indexOfFirstProduct, indexOfLastProduct);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, rankingFilter, branchFilter]);

  return (
    <div className="products-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Productos</h1>
          <p className="page-subtitle">Catálogo de medicamentos y muestras médicas</p>
        </div>
        <div className="btn-group">
          <div className="search-container" style={{ width: '250px' }}>
            <span>🔍</span>
            <input 
              type="text" 
              placeholder="Buscar..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ border: 'none', background: 'none', width: '100%', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>
          <button className="btn btn-secondary" onClick={() => setShowLogModal(true)}>🔍 Diagnóstico</button>
          <select 
            className="form-input" 
            style={{ width: 'auto', minWidth: '160px' }}
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="all">🌍 Todas las Sucursales</option>
            {BRANCHES.map(b => (
              <option key={b} value={b}>📍 {b}</option>
            ))}
          </select>
        </div>
      </div>
        
        {syncInfo?.last_sync && (
          <div className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(var(--primary-rgb), 0.05)', border: '1px solid rgba(var(--primary-rgb), 0.1)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>📡 Estatus del Inventario</div>
              <div style={{ fontSize: '14px', fontWeight: '600' }}>
                <span style={{ color: 'var(--primary-color)' }}>🕒 Última actualización: </span>
                {new Date(syncInfo.last_sync.synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                <span style={{ margin: '0 8px', color: 'var(--border-color)' }}>|</span>
                <span style={{ color: '#10b981' }}>{syncInfo.last_sync.updated} Cambios</span>
                <span style={{ margin: '0 8px', color: 'var(--border-color)' }}>|</span>
                <span style={{ color: '#ef4444' }}>{syncInfo.last_sync.unmatched} Sin Match</span>
              </div>
            </div>
            <button className="btn btn-secondary" onClick={handleManualSync} disabled={syncing}>
              {syncing ? <div className="spinner" style={{width: 14, height: 14}}></div> : '🔄 Actualizar Ahora'}
            </button>
          </div>
        )}

      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <h2 className="card-title">💊 Lista de Productos ({filteredProducts.length})</h2>
          
          <div className="tabs" style={{ display: 'flex', gap: '6px', background: 'var(--bg-glass)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
            <button className={`btn ${rankingFilter === 'all' ? 'btn-primary' : ''}`} style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => setRankingFilter('all')}>Todos</button>
            {['AA', 'A', 'B', 'C', 'E', 'Z'].map(rank => (
              <button 
                key={rank}
                className={`btn ${rankingFilter === rank.toLowerCase() ? 'btn-primary' : ''}`} 
                style={{ padding: '4px 12px', fontSize: '12px' }} 
                onClick={() => setRankingFilter(rank.toLowerCase())}
              >
                {rank}
              </button>
            ))}
            <button className={`btn ${rankingFilter === 'risk' ? 'btn-primary' : ''}`} style={{ padding: '4px 12px', fontSize: '12px', color: rankingFilter === 'risk' ? 'white' : '#ef4444' }} onClick={() => setRankingFilter('risk')}>🚨 En Riesgo</button>
          </div>

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
            <button className="btn btn-secondary" onClick={() => api.exportProductsExcel()}>📥 Exportar</button>
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

            <button className="btn btn-secondary" onClick={() => navigate('/planning')}>🧠 Planeación</button>
            <button className="btn btn-primary" onClick={openCreate}>+ Nuevo Producto</button>
            
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '10px', padding: '8px', background: 'rgba(var(--primary-rgb), 0.05)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold' }}>🛒 Pedido para:</span>
              <select 
                className="form-input" 
                style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }}
                onChange={(e) => {
                  const days = parseInt(e.target.value);
                  if (!days) return;
                  
                  // Incluir AA, A, B, C
                  const eligibleProducts = products.filter(p => ['aa', 'a', 'b', 'c'].includes((p.ranking || '').toLowerCase()));
                  
                  const headers = ['Producto', 'Barcode', 'Ranking', 'Stock Total', 'Sug. MATRIZ', 'Sug. TAMPICO', 'Sug. CIVIL', 'Sug. EJERCITO', 'Sug. CURVA TEXAS'];
                  const rows = [];

                  eligibleProducts.forEach(p => {
                    const sm = p.sales_metrics || {};
                    const sbb = p.stock_by_branch || {};
                    let hasOrder = false;
                    
                    const calc = (branch) => {
                      const rate = (sm[branch] || {}).daily_rate || 0;
                      const stock = sbb[branch] || 0;
                      const transit = p.transit_stock || 0;
                      
                      // El tránsito se resta del sugerido total
                      // Si el tránsito es global, lo restamos proporcionalmente o del total
                      // Para simplificar, restamos el tránsito global del primer requerimiento o prorrateado
                      // Pero el usuario pidió "cuantas pedir para cada sucursal".
                      // Si el tránsito es para una sucursal específica sería ideal, pero si es global:
                      const suggested = Math.ceil(rate * days) - stock;
                      return Math.max(0, suggested);
                    };

                    const branchSuggestions = [
                      calc('MATRIZ'),
                      calc('TAMPICO'),
                      calc('CIVIL'),
                      calc('EJERCITO'),
                      calc('CURVA TEXAS')
                    ];

                    // Restar tránsito global del total sugerido de forma inteligente
                    const totalSuggestedBeforeTransit = branchSuggestions.reduce((a, b) => a + b, 0);
                    const transitTotal = p.transit_stock || 0;
                    
                    if (totalSuggestedBeforeTransit > 0) {
                      let remainingTransit = transitTotal;
                      const finalSuggestions = branchSuggestions.map(s => {
                        if (remainingTransit <= 0) return s;
                        const deduction = Math.min(s, remainingTransit);
                        remainingTransit -= deduction;
                        return s - deduction;
                      });

                      if (finalSuggestions.some(s => s > 0)) {
                        rows.push([
                          p.name.replace(/,/g, ''),
                          p.barcode,
                          p.ranking,
                          p.stock,
                          ...finalSuggestions
                        ]);
                      }
                    }
                  });

                  if (rows.length === 0) {
                    addToast('No hay productos que requieran pedido para este periodo');
                    return;
                  }

                  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = `Reporte_Compra_${days}dias_${new Date().toISOString().split('T')[0]}.csv`;
                  link.click();
                  e.target.value = ""; // Reset selector
                }}
              >
                <option value="">Descargar Reporte...</option>
                <option value="7">7 Días</option>
                <option value="15">15 Días</option>
                <option value="30">30 Días</option>
                <option value="45">45 Días</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-container"><div className="spinner"></div><span>Cargando productos...</span></div>
        ) : currentProducts.length > 0 ? (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Ranking</th>
                    {branchFilter === 'all' ? (
                      BRANCHES.map(b => (
                        <th key={b} style={{ textAlign: 'center', fontSize: '10px', padding: '10px 6px', backgroundColor: 'rgba(var(--primary-rgb), 0.05)' }}>
                          {'📦 ' + b}
                        </th>
                      ))
                    ) : (
                      <th style={{ textAlign: 'center', backgroundColor: 'rgba(var(--primary-rgb), 0.05)' }}>{'📦 ' + branchFilter}</th>
                    )}
                    <th style={{ textAlign: 'center' }}>Total</th>
                    <th style={{ textAlign: 'center', color: '#3b82f6' }}>🚚 Tránsito</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {currentProducts.map(prod => {
                    const isHighRanking = prod.ranking === 'AA' || prod.ranking === 'A';
                    const totalStock = prod.stock || 0;
                    const sbb = prod.stock_by_branch || {};
                    const relevantStock = branchFilter !== 'all' ? (sbb[branchFilter] || 0) : totalStock;
                    const isLowStock = relevantStock <= (prod.min_stock || 5);
                    const isCritical = isHighRanking && isLowStock;
                    return (
                      <tr key={prod.id} style={{ backgroundColor: isCritical ? 'rgba(239, 68, 68, 0.05)' : 'transparent', borderLeft: isCritical ? '4px solid #ef4444' : '4px solid transparent' }}>
                        <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{prod.barcode || '—'}</td>
                        <td style={{ fontWeight: 600 }}>
                          {prod.name}
                          {isCritical && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#ef4444', fontWeight: 'bold' }}>⚠️ Crítico</span>}
                        </td>
                        <td><span className={`badge ${isHighRanking ? 'badge-success' : 'badge-warning'}`}>{prod.ranking || '—'}</span></td>
                        {branchFilter === 'all' ? (
                          BRANCHES.map(b => {
                            const bs = sbb[b] || 0;
                            const bCritical = isHighRanking && bs <= (prod.min_stock || 5) && bs > 0;
                            const bEmpty = bs === 0;
                            return (
                              <td key={b} style={{ textAlign: 'center', padding: '8px 4px' }}>
                                <span style={{
                                  fontSize: '14px',
                                  fontWeight: '800',
                                  color: bEmpty ? 'var(--text-muted)' : bCritical ? '#ef4444' : '#10b981',
                                  background: bEmpty ? 'transparent' : bCritical ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                                  padding: '2px 8px',
                                  borderRadius: '6px'
                                }}>
                                  {bs}
                                </span>
                              </td>
                            );
                          })
                        ) : (
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              fontSize: '18px',
                              fontWeight: '800',
                              color: isCritical ? '#ef4444' : 'var(--primary-color)'
                            }}>
                              {sbb[branchFilter] || 0}
                            </span>
                          </td>
                        )}
                        <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '15px', color: 'var(--primary-color)' }}>{totalStock}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ 
                          fontSize: '14px', 
                          fontWeight: '700', 
                          color: prod.transit_stock > 0 ? '#3b82f6' : 'var(--text-muted)',
                          background: prod.transit_stock > 0 ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                          padding: '2px 8px',
                          borderRadius: '6px'
                        }}>
                          {prod.transit_stock || 0}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                          <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(prod)}>✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(prod.id, prod.name)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', padding: '20px', borderTop: '1px solid var(--border-color)' }}>
              <button 
                className="btn btn-secondary" 
                disabled={currentPage === 1} 
                onClick={() => { setCurrentPage(prev => prev - 1); window.scrollTo(0, 0); }}
              >
                ◀️ Anterior
              </button>
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
                Página {currentPage} de {totalPages}
              </span>
              <button 
                className="btn btn-secondary" 
                disabled={currentPage === totalPages} 
                onClick={() => { setCurrentPage(prev => prev + 1); window.scrollTo(0, 0); }}
              >
                Siguiente ▶️
              </button>
            </div>
          </>
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
                  <label className="form-label">💰 Precio Vale</label>
                  <input type="number" step="0.01" className="form-input" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label className="form-label">🚚 Stock en Tránsito (Pedido)</label>
                  <input type="number" className="form-input" value={form.transit_stock} onChange={e => setForm({ ...form, transit_stock: parseInt(e.target.value) || 0 })} placeholder="0" />
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Este valor se restará de las sugerencias de compra.</p>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Guardar Cambios' : 'Crear Producto'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Diagnóstico de Sync */}
      {showLogModal && (
        <div className="modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="modal" style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">📊 Diagnóstico de Sincronización</h2>
            {syncInfo?.last_sync ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                  <div className="card" style={{ padding: '12px', borderLeft: '4px solid var(--primary-color)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>TOTAL MYSQL</div>
                    <div style={{ fontSize: '20px', fontWeight: '800' }}>{syncInfo.last_sync.total_mysql}</div>
                  </div>
                  <div className="card" style={{ padding: '12px', borderLeft: '4px solid #10b981' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>✅ ENCONTRADOS</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#10b981' }}>{syncInfo.last_sync.matched}</div>
                  </div>
                  <div className="card" style={{ padding: '12px', borderLeft: '4px solid #ef4444' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>❌ SIN COINCIDENCIA</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#ef4444' }}>{syncInfo.last_sync.unmatched}</div>
                  </div>
                </div>

                <div className="tabs" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                   <button 
                    className={`btn ${diagnosticTab === 'matched' ? 'btn-primary' : 'btn-secondary'}`} 
                    onClick={() => setDiagnosticTab('matched')}
                    style={{ fontSize: '11px', padding: '6px 12px' }}
                   >
                     ✅ Encontrados ({syncInfo.last_sync.matched})
                   </button>
                   <button 
                    className={`btn ${diagnosticTab === 'unmatched' ? 'btn-primary' : 'btn-secondary'}`} 
                    onClick={() => setDiagnosticTab('unmatched')}
                    style={{ fontSize: '11px', padding: '6px 12px' }}
                   >
                     ❌ No Encontrados ({syncInfo.last_sync.unmatched})
                   </button>
                   <button 
                    className={`btn ${diagnosticTab === 'aliases' ? 'btn-primary' : 'btn-secondary'}`} 
                    onClick={() => { setDiagnosticTab('aliases'); loadAliases(); }}
                    style={{ fontSize: '11px', padding: '6px 12px' }}
                   >
                     🔗 Alias Manuales
                   </button>
                </div>

                <div className="table-wrapper" style={{ maxHeight: '350px' }}>
                  <table>
                    <thead>
                      {diagnosticTab === 'matched' ? (
                        <tr>
                          <th>Nombre en MySQL</th>
                          <th>Vinculado con (Render)</th>
                          <th style={{ textAlign: 'center' }}>Stock</th>
                        </tr>
                      ) : diagnosticTab === 'unmatched' ? (
                        <tr>
                          <th>Nombre en MySQL</th>
                          <th>Código</th>
                          <th>Stock</th>
                          <th style={{ textAlign: 'center' }}>Vincular</th>
                        </tr>
                      ) : (
                        <tr>
                          <th>Nombre MySQL (Alias)</th>
                          <th>Vinculado con</th>
                          <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {diagnosticTab === 'matched' ? (
                        (Array.isArray(syncInfo.matched_list) ? syncInfo.matched_list : JSON.parse(syncInfo.last_sync.matched_list || '[]')).slice(0, 100).map((item, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: '12px', fontWeight: 600 }}>{item.mysql}</td>
                            <td style={{ fontSize: '12px', color: '#10b981' }}>{item.pg}</td>
                            <td style={{ fontSize: '12px', textAlign: 'center' }}>{item.stock}</td>
                          </tr>
                        ))
                      ) : diagnosticTab === 'unmatched' ? (
                        (Array.isArray(syncInfo.unmatched_list) ? syncInfo.unmatched_list : JSON.parse(syncInfo.last_sync.unmatched_list || '[]')).slice(0, 100).map((item, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: '12px', fontWeight: 600 }}>{item.nombre}</td>
                            <td style={{ fontSize: '12px', fontFamily: 'monospace' }}>{item.codigo}</td>
                            <td style={{ fontSize: '12px' }}>{item.existencia}</td>
                            <td style={{ textAlign: 'center' }}>
                              {mappingFor === item.nombre ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px' }}>
                                  <input 
                                    type="text" 
                                    className="form-input" 
                                    placeholder="Buscar producto..." 
                                    value={mapSearch}
                                    onChange={(e) => {
                                      setMapSearch(e.target.value);
                                      if (e.target.value.length >= 2) {
                                        api.searchProductsForMapping(e.target.value).then(r => setMapResults(Array.isArray(r) ? r : [])).catch(() => {});
                                      } else {
                                        setMapResults([]);
                                      }
                                    }}
                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                    autoFocus
                                  />
                                  {mapResults.length > 0 && (
                                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                                      {mapResults.map(p => (
                                        <div 
                                          key={p.id}
                                          onClick={async () => {
                                            try {
                                              const res = await api.mapProduct(item.nombre, p.id);
                                              addToast(res.message);
                                              setMappingFor(null);
                                              setMapSearch('');
                                              setMapResults([]);
                                            } catch (err) {
                                              addToast(err.message || 'Error al vincular', 'error');
                                            }
                                          }}
                                          style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '11px', borderBottom: '1px solid var(--border-color)' }}
                                          onMouseEnter={e => e.target.style.background = 'rgba(var(--primary-rgb), 0.1)'}
                                          onMouseLeave={e => e.target.style.background = 'transparent'}
                                        >
                                          <strong>{p.name}</strong>
                                          <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                                            {p.ranking && `[${p.ranking}]`} Stock: {p.stock}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <button className="btn btn-secondary" style={{ fontSize: '10px', padding: '2px 8px' }} onClick={() => { setMappingFor(null); setMapSearch(''); setMapResults([]); }}>Cancelar</button>
                                </div>
                              ) : (
                                <button 
                                  className="btn btn-secondary btn-sm" 
                                  style={{ fontSize: '10px', padding: '3px 10px' }}
                                  onClick={() => { setMappingFor(item.nombre); setMapSearch(''); setMapResults([]); }}
                                >
                                  🔗 Vincular
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        aliases.map((a, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: '12px', fontWeight: 600 }}>{a.alias_name}</td>
                            <td style={{ fontSize: '12px', color: '#10b981' }}>{a.product_name}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button 
                                className="btn btn-danger btn-sm" 
                                style={{ fontSize: '10px', padding: '3px 8px' }}
                                onClick={async () => {
                                  try {
                                    await api.deleteAlias(a.id);
                                    addToast('Alias eliminado');
                                    loadAliases();
                                  } catch (err) {
                                    addToast(err.message, 'error');
                                  }
                                }}
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="loading-container"><div className="spinner"></div><span>Cargando diagnóstico...</span></div>
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
