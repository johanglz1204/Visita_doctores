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
    <div>
       <div className="page-header" style={{ alignItems: 'flex-start' }}>
         <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
           <button className="btn btn-secondary" onClick={() => navigate('/doctors')}>← Regresar</button>
           <div style={{
             width: '60px', height: '60px', borderRadius: '50%', 
             background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))',
             display: 'flex', alignItems: 'center', justifyContent: 'center',
             fontSize: '24px', color: 'white', fontWeight: 'bold'
           }}>
              {doctor.name.charAt(0).toUpperCase()}
           </div>
           <div>
             <h1 className="page-title">{doctor.name}</h1>
             <p className="page-subtitle">{doctor.specialty || 'General'} | Licencia: {doctor.license || 'N/A'}</p>
           </div>
         </div>
       </div>

       <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card purple">
            <div className="stat-icon">📈</div>
            <div className="stat-value">{stats?.totalPrescriptions || 0}</div>
            <div className="stat-label">Total Histórico de Prescripciones</div>
          </div>
          <div className="stat-card cyan">
             <div className="stat-icon">📞</div>
             <div style={{ fontSize: '18px', fontWeight: 'bold', margin: '10px 0' }}>{doctor.phone || 'Sin número'}</div>
             <div className="stat-label">Contacto Principal</div>
             {doctor.phone && (
               <button 
                 className="btn btn-primary" 
                 style={{ width: '100%', marginTop: '10px', background: '#25D366', borderColor: '#25D366' }}
                 onClick={() => {
                   const cleanPhone = doctor.phone.replace(/\D/g, '');
                   const finalPhone = cleanPhone.length === 10 ? '52' + cleanPhone : cleanPhone;
                   const topProduct = stats?.preferredProducts?.[0]?.name || 'nuestros productos';
                   const message = encodeURIComponent(`Hola Dr. ${doctor.name}, le saludo de VisitaDoctores para darle seguimiento. Nos da gusto ver su preferencia por ${topProduct}. Quedo a sus órdenes.`);
                   window.open(`https://api.whatsapp.com/send?phone=${finalPhone}&text=${message}`, '_blank');
                 }}
               >
                 💬 Contactar por WhatsApp
               </button>
             )}
          </div>
          <div className="stat-card green" style={{ gridColumn: 'span 2' }}>
             <div className="stat-icon">🏢</div>
             <div style={{ fontSize: '16px', margin: '10px 0' }}>{doctor.address || 'Sin dirección registrada'}</div>
             <div className="stat-label">Consultorio / Ubicación</div>
          </div>
       </div>

       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
         
         <div className="card">
            <div className="card-header">
               <h2 className="card-title">💊 Top 3 Productos Recetados</h2>
            </div>
            <div style={{ padding: '1rem' }}>
               {stats?.preferredProducts?.length > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                     {stats.preferredProducts.map((p, i) => (
                        <li key={i} style={{ 
                           display: 'flex', justifyContent: 'space-between', 
                           padding: '12px', borderBottom: '1px solid var(--border-color)',
                           background: i === 0 ? 'var(--bg-glass)' : 'transparent',
                           borderRadius: i === 0 ? '8px' : '0'
                        }}>
                           <span style={{ fontWeight: i === 0 ? 'bold' : 'normal' }}>
                              {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : '🥉 '}{p.name}
                           </span>
                           <span style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>{p.quantity} Pza</span>
                        </li>
                     ))}
                  </ul>
               ) : (
                  <p className="empty-state">Aún no hay productos registrados para este doctor.</p>
               )}
            </div>
         </div>

         <div className="card">
            <div className="card-header">
               <h2 className="card-title">📉 Historial de Tendencia (Últimos 6 meses)</h2>
            </div>
            <div style={{ height: 250, padding: '1rem', width: '100%' }}>
               {stats?.recentHistory?.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={stats.recentHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                        <XAxis dataKey="month" stroke="var(--text-muted)" />
                        <YAxis stroke="var(--text-muted)" allowDecimals={false} />
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                        <Bar dataKey="quantity" name="Recetas" fill="var(--primary-color)" radius={[4, 4, 0, 0]} />
                     </BarChart>
                  </ResponsiveContainer>
               ) : (
                  <p className="empty-state">No hay registros en los últimos 6 meses.</p>
               )}
            </div>
         </div>

       </div>
    </div>
  );
}
