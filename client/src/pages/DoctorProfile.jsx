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
  }, [id]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <span>Cargando perfil clínico...</span>
      </div>
    );
  }

  if (!doctor) return null;

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
            <h1 className="page-title">{doctor.name}</h1>
            <p className="page-subtitle">{doctor.specialty || 'Especialista'} | {doctor.license || 'Cédula N/A'}</p>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '24px' }}>📊</span>
          <div style={{ fontSize: '28px', fontWeight: '800' }}>{stats?.totalPrescriptions || 0}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Total Recetas</div>
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
                const topProduct = stats?.preferredProducts?.[0]?.name || 'sus productos';
                const message = encodeURIComponent(`Hola Dr. ${doctor.name}, le saludo de VisitaDoctores.`);
                window.open(`https://api.whatsapp.com/send?phone=${finalPhone}&text=${message}`, '_blank');
              }}
            >
              💬 WhatsApp
            </button>
          )}
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
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
    </div>
  );
}
