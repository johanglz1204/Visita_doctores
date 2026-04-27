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

  const loadVisits = () => {
    api.getDoctorVisits(id).then(d => setVisits(Array.isArray(d) ? d : [])).catch(() => {});
  };

  useEffect(() => {
    Promise.all([
      api.getDoctor(id),
      api.getDoctorStats(id)
    ])
    .then(([docData, statData]) => {
      setDoctor(docData);
      setStats(statData);
    })
    .catch(err => {
       addToast(err.message, 'error');
       navigate('/doctors');
    })
    .finally(() => setLoading(false));

    loadVisits();
  }, [id]);

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

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '24px' }}>📊</span>
          <div style={{ fontSize: '28px', fontWeight: '800' }}>{stats?.totalPrescriptions || 0}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Total Recetas</div>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">💊 Top Productos</h2>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: 'right' }}>Cantidad</th>
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
                  <tr><td colSpan="2" style={{ textAlign: 'center' }}>Sin registros</td></tr>
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
    </div>
  );
}
