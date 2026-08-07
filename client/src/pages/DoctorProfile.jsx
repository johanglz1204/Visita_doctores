import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function DoctorProfile({ addToast }) {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [doctor, setDoctor] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState([]);
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [visitForm, setVisitForm] = useState({ samples_left: '', notes: '' });

  // Nuevos estados para inventario
  const [assignedInventory, setAssignedInventory] = useState([]);
  const [productsCatalogue, setProductsCatalogue] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [assignForm, setAssignForm] = useState({ product_id: '', target_stock: '', current_stock: '' });
  const [editForm, setEditForm] = useState({ id: null, product_name: '', target_stock: '', current_stock: '' });
  const [movements, setMovements] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // Mes seleccionado para el desglose de piezas por producto.
  // Arranca en el mes en curso; "all" muestra el acumulado histórico.
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const formatMonthLabel = (m) => {
    if (m === 'all') return '📚 Histórico total';
    const [year, month] = String(m).split('-').map(Number);
    if (!year || !month) return m;
    const label = new Date(year, month - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const loadVisits = () => {
    api.getDoctorVisits(id).then(d => setVisits(Array.isArray(d) ? d : [])).catch(() => {});
  };

  const loadInventory = () => {
    api.getInventory({ doctor_id: id })
      .then(data => setAssignedInventory(Array.isArray(data) ? data : []))
      .catch(console.error);
  };

  useEffect(() => {
    Promise.all([
      api.getDoctor(id),
      api.getInventory({ doctor_id: id }),
      api.getProducts()
    ])
    .then(([docData, invData, prodsData]) => {
      setDoctor(docData);
      setAssignedInventory(Array.isArray(invData) ? invData : []);
      setProductsCatalogue(Array.isArray(prodsData) ? prodsData : []);
    })
    .catch(err => {
       addToast(err.message, 'error');
       navigate('/doctors');
     })
    .finally(() => setLoading(false));

    loadVisits();
  }, [id]);

  // Las estadísticas se recargan también al cambiar el mes del selector
  useEffect(() => {
    api.getDoctorStats(id, selectedMonth).then(setStats).catch(() => {});
  }, [id, selectedMonth]);

  const handleVisitSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.createDoctorVisit(id, visitForm);
      addToast('✅ Visita registrada');
      setVisitForm({ samples_left: '', notes: '' });
      setShowVisitForm(false);
      loadVisits();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignForm.product_id) {
      addToast('Por favor selecciona un producto', 'error');
      return;
    }
    try {
      await api.createInventory({
        doctor_id: parseInt(id),
        product_id: parseInt(assignForm.product_id),
        target_stock: parseInt(assignForm.target_stock || 0),
        current_stock: parseInt(assignForm.current_stock || assignForm.target_stock || 0),
      });
      addToast('✅ Producto asignado con éxito');
      setShowAssignModal(false);
      setAssignForm({ product_id: '', target_stock: '', current_stock: '' });
      setProductSearch('');
      loadInventory();
      api.getDoctorStats(id, selectedMonth).then(setStats).catch(() => {});
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.updateInventory(editForm.id, {
        target_stock: parseInt(editForm.target_stock || 0),
        current_stock: parseInt(editForm.current_stock || 0),
      });
      addToast('✅ Inventario actualizado');
      setShowEditModal(false);
      loadInventory();
      api.getDoctorStats(id, selectedMonth).then(setStats).catch(() => {});
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDeleteAssignment = async (inventoryId) => {
    if (!confirm('¿Seguro que deseas eliminar la asignación de este medicamento para este doctor?')) return;
    try {
      await api.deleteInventory(inventoryId);
      addToast('✅ Asignación eliminada');
      loadInventory();
      api.getDoctorStats(id, selectedMonth).then(setStats).catch(() => {});
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleViewMovements = async (item) => {
    setSelectedProduct(item);
    setLoadingMovements(true);
    setShowMovementsModal(true);
    try {
      const res = await api.getSales(100, 0, 'TODAS', null, null, id, item.product_id);
      setMovements(res.data || []);
    } catch (err) {
      addToast('Error al obtener movimientos: ' + err.message, 'error');
    } finally {
      setLoadingMovements(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <span>Cargando perfil clínico...</span>
      </div>
    );
  }

  if (!doctor) return null;

  const categoryColors = { A: '#10b981', B: '#f59e0b', C: '#94a3b8' };

  return (
    <div className="doctor-profile-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/doctors')}>←</button>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px', 
            background: 'var(--primary-color)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', color: 'white', fontWeight: '800'
          }}>
            {doctor.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="page-title">
              {doctor.name}
              {doctor.category && (
                <span style={{ 
                  marginLeft: '12px', fontSize: '14px', padding: '2px 10px', borderRadius: '6px',
                  background: `${categoryColors[doctor.category] || '#94a3b8'}20`,
                  color: categoryColors[doctor.category] || '#94a3b8',
                  fontWeight: 800
                }}>
                  Cat. {doctor.category}
                </span>
              )}
            </h1>
            <p className="page-subtitle">{doctor.specialty || 'Especialista'} | {doctor.license || 'Cédula N/A'}</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowVisitForm(true)}>
          📋 Registrar Visita
        </button>
      </div>

      {/* Control de Muestras e Inventario Asignado */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <h2 className="card-title">📦 Inventario Asignado</h2>
          <button 
            className="btn btn-primary btn-sm" 
            onClick={() => {
              setAssignForm({ product_id: '', target_stock: '', current_stock: '' });
              setProductSearch('');
              setShowAssignModal(true);
            }}
          >
            + Asignar Producto
          </button>
        </div>
        {assignedInventory.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Medicamento</th>
                  <th>Existencia / Objetivo</th>
                  <th>Última Actualización</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {assignedInventory.map(item => {
                  const isLow = item.current_stock <= (item.target_stock * 0.2);
                  const isCritical = item.current_stock === 0;
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.product_name}</td>
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
                      <td style={{ fontSize: '13px' }}>
                        {item.updated_at ? new Date(item.updated_at).toLocaleDateString('es-MX') : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="btn-group" style={{ justifyContent: 'flex-end', gap: '6px' }}>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => handleViewMovements(item)}
                            title="Ver Historial de Movimientos"
                          >
                            📈 Movimientos
                          </button>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            style={{ padding: '4px 8px' }}
                            onClick={() => {
                              setEditForm({
                                id: item.id,
                                product_name: item.product_name,
                                target_stock: item.target_stock,
                                current_stock: item.current_stock
                              });
                              setShowEditModal(true);
                            }}
                            title="Editar Stock"
                          >
                            ✏️
                          </button>
                          <button 
                            className="btn btn-danger btn-sm" 
                            style={{ padding: '4px 8px' }}
                            onClick={() => handleDeleteAssignment(item.id)}
                            title="Eliminar Asignación"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '30px' }}>
            <div className="empty-state-icon">📦</div>
            <p className="empty-state-text">No hay medicamentos asignados a este doctor</p>
            <p className="empty-state-hint">Asigna productos para llevar control del stock de muestras.</p>
          </div>
        )}
      </div>

      {/* Bitácora de Visitas */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <h2 className="card-title">📋 Bitácora de Visitas</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowVisitForm(true)}>+ Nueva Visita</button>
        </div>
        {visits.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Muestras Dejadas</th>
                  <th>Notas</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visits.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600, fontSize: '13px' }}>
                      {new Date(v.visit_date).toLocaleDateString('es-MX')} {new Date(v.visit_date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ fontSize: '13px' }}>{v.samples_left || '—'}</td>
                    <td style={{ fontSize: '13px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.notes || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-danger btn-sm" style={{ fontSize: '10px', padding: '3px 8px' }} onClick={async () => {
                        await api.deleteDoctorVisit(id, v.id);
                        addToast('Visita eliminada');
                        loadVisits();
                      }}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '30px' }}>
            <div className="empty-state-icon">📋</div>
            <p className="empty-state-text">Sin visitas registradas</p>
            <p className="empty-state-hint">Haz clic en "Registrar Visita" para comenzar el historial.</p>
          </div>
        )}
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px', marginTop: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '24px' }}>📊</span>
          <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--primary-color)' }}>{stats?.totalPrescriptions || 0}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Total Recetas</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Historial completo</div>
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '3px solid var(--primary-color)' }}>
          <span style={{ fontSize: '24px' }}>🗓️</span>
          <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--primary-color)' }}>{stats?.thisMonthPrescriptions || 0}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Este Mes</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date().toLocaleString('es-MX', { month: 'long', year: 'numeric' })}</div>
        </div>
        
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '24px' }}>📋</span>
          <div style={{ fontSize: '28px', fontWeight: '800' }}>{visits.length}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Visitas Registradas</div>
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '24px' }}>📞</span>
          <div style={{ fontSize: '18px', fontWeight: '700' }}>{doctor.phone || 'Sin número'}</div>
          {doctor.phone && (
            <button 
              className="btn btn-secondary btn-sm" 
              style={{ color: '#25D366', marginTop: '4px' }}
              onClick={() => {
                const cleanPhone = doctor.phone.replace(/\D/g, '');
                const finalPhone = cleanPhone.length === 10 ? '52' + cleanPhone : cleanPhone;
                const message = encodeURIComponent(`Hola Dr. ${doctor.name}, le saludo de VisitaDoctores.`);
                window.open(`https://api.whatsapp.com/send?phone=${finalPhone}&text=${message}`, '_blank');
              }}
            >
              💬 WhatsApp
            </button>
          )}
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '24px' }}>🏢</span>
          <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '4px' }}>{doctor.address || 'Sin dirección registrada'}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>UBICACIÓN / CONSULTORIO</div>
        </div>
      </div>

      {/* Estadísticas de recetas e histórico */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginTop: '24px' }}>
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <h2 className="card-title">💊 Top Productos</h2>
            <select
              className="form-input"
              style={{ width: 'auto', minWidth: '170px', borderRadius: '12px' }}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              {(stats?.availableMonths || [selectedMonth]).map(m => (
                <option key={m} value={m}>🗓️ {formatMonthLabel(m)}</option>
              ))}
              <option value="all">📚 Histórico total</option>
            </select>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: 'right' }}>Piezas</th>
                </tr>
              </thead>
              <tbody>
                {stats?.preferredProducts?.length > 0 ? (
                  stats.preferredProducts.map((p, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{i === 0 ? '🥇 ' : ''}{p.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary-color)' }}>{p.quantity} Pza</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="2" style={{ textAlign: 'center' }}>
                      {selectedMonth === 'all' ? 'Sin registros' : `Sin ventas en ${formatMonthLabel(selectedMonth)}`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">📉 Tendencia Mensual</h2>
          </div>
          <div style={{ height: 250, width: '100%', marginTop: '16px' }}>
            {stats?.recentHistory?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.recentHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--text-muted)" tick={{ fontSize: 12 }} />
                  <YAxis stroke="var(--text-muted)" allowDecimals={false} hide />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }} />
                  <Bar dataKey="quantity" fill="var(--primary-color)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">No hay registros históricos</div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Registrar Visita */}
      {showVisitForm && (
        <div className="modal-overlay" onClick={() => setShowVisitForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">📋 Registrar Visita — {doctor.name}</h2>
            <form onSubmit={handleVisitSubmit}>
              <div className="form-group">
                <label className="form-label">Muestras Dejadas</label>
                <input 
                  className="form-input" 
                  value={visitForm.samples_left} 
                  onChange={e => setVisitForm({ ...visitForm, samples_left: e.target.value })} 
                  placeholder="Ej: 2x Farmapram 0.5mg, 1x Losartan 50mg" 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Notas de la Visita</label>
                <textarea 
                  className="form-textarea" 
                  value={visitForm.notes} 
                  onChange={e => setVisitForm({ ...visitForm, notes: e.target.value })} 
                  placeholder="Comentarios del doctor, observaciones, siguiente paso..."
                  rows={3}
                ></textarea>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowVisitForm(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Visita</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Asignar Medicamento */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">➕ Asignar Medicamento</h2>
            <form onSubmit={handleAssignSubmit}>
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">Buscar Medicamento (Nombre o Código) *</label>
                <input 
                  className="form-input" 
                  value={productSearch}
                  onChange={e => {
                    const text = e.target.value;
                    setProductSearch(text);
                    setAssignForm({ ...assignForm, product_id: '' });
                  }}
                  placeholder="Escribe el nombre o código del medicamento..."
                  required
                />
                
                {productSearch && !assignForm.product_id && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--bg-card-solid)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    boxShadow: 'var(--shadow-lg)',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000,
                    marginTop: '4px'
                  }}>
                    {productsCatalogue
                      .filter(p => 
                        p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
                        (p.barcode && p.barcode.toLowerCase().includes(productSearch.toLowerCase()))
                      )
                      .slice(0, 10)
                      .map(p => (
                        <div 
                          key={p.id}
                          onClick={() => {
                            setAssignForm({ ...assignForm, product_id: String(p.id) });
                            setProductSearch(`${p.name} ${p.presentation ? `(${p.presentation})` : ''}`);
                          }}
                          style={{
                            padding: '10px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border-color)',
                            fontSize: '13px',
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={e => e.target.style.background = 'var(--bg-glass)'}
                          onMouseLeave={e => e.target.style.background = 'transparent'}
                        >
                          <div style={{ fontWeight: 'bold' }}>{p.name} {p.presentation ? `(${p.presentation})` : ''}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {p.laboratory ? `${p.laboratory}` : ''} {p.barcode ? `| Código: ${p.barcode}` : ''}
                          </div>
                        </div>
                      ))
                    }
                    {productsCatalogue.filter(p => 
                      p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
                      (p.barcode && p.barcode.toLowerCase().includes(productSearch.toLowerCase()))
                    ).length === 0 && (
                      <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
                        No se encontraron medicamentos coincidentes
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Stock Objetivo *</label>
                  <input 
                    className="form-input" 
                    type="number" 
                    required 
                    min="0" 
                    value={assignForm.target_stock} 
                    onChange={e => setAssignForm({ ...assignForm, target_stock: e.target.value })} 
                    placeholder="Ej. 10" 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Existencia Inicial</label>
                  <input 
                    className="form-input" 
                    type="number" 
                    min="0" 
                    value={assignForm.current_stock} 
                    onChange={e => setAssignForm({ ...assignForm, current_stock: e.target.value })} 
                    placeholder="Ej. 5 (por defecto igual al Objetivo)" 
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Asignar Medicamento</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Stock */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">✏️ Editar Stock — {editForm.product_name}</h2>
            <form onSubmit={handleEditSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Stock Objetivo *</label>
                  <input 
                    className="form-input" 
                    type="number" 
                    required 
                    min="0" 
                    value={editForm.target_stock} 
                    onChange={e => setEditForm({ ...editForm, target_stock: e.target.value })} 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Existencia Actual *</label>
                  <input 
                    className="form-input" 
                    type="number" 
                    required
                    min="0" 
                    value={editForm.current_stock} 
                    onChange={e => setEditForm({ ...editForm, current_stock: e.target.value })} 
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial de Movimientos */}
      {showMovementsModal && (
        <div className="modal-overlay" onClick={() => setShowMovementsModal(false)}>
          <div className="modal" style={{ maxWidth: '800px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">📈 Historial de Movimientos</h2>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{selectedProduct?.product_name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                Doctor: {doctor.name} | Cédula: {doctor.license || 'Sin Cédula'}
              </div>
            </div>

            {loadingMovements ? (
              <div className="loading-container" style={{ padding: '40px 0' }}>
                <div className="spinner"></div>
                <span>Cargando historial de movimientos...</span>
              </div>
            ) : movements.length > 0 ? (
              <div className="table-wrapper" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Cantidad</th>
                      <th>Sucursal</th>
                      <th>Texto Original / Ticket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(m => (
                      <tr key={m.id}>
                        <td style={{ fontSize: '13px', fontWeight: 600 }}>
                          {m.sale_date ? new Date(m.sale_date).toLocaleDateString('es-MX', { timeZone: 'UTC' }) : '—'}
                        </td>
                        <td style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                          -{m.quantity} Pza
                        </td>
                        <td style={{ fontSize: '13px' }}>{m.sucursal || '—'}</td>
                        <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                          {m.raw_text || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '40px 0' }}>
                <div className="empty-state-icon">📉</div>
                <p className="empty-state-text">No hay movimientos registrados para este medicamento</p>
                <p className="empty-state-hint">Las recetas o ventas registradas para este doctor aparecerán aquí.</p>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowMovementsModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
