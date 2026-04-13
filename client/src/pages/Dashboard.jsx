import { useState, useEffect } from 'react';
import { api } from '../api';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard({ addToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [backing, setBacking] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const loadData = () => {
    setLoading(true);
    api.getDashboard()
      .then(d => {
        setData(d);
        // Update lastSync only if server reports a sync has run
        if (d.lastSyncTime) setLastSync(new Date(d.lastSyncTime));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    // Auto-refresh dashboard data every 30 min to capture backend auto-sync results
    const interval = setInterval(loadData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncEmail = async () => {
    setSyncing(true);
    try {
      const res = await api.syncEmails();
      addToast(res.message);
      if (res.lastSyncTime) setLastSync(new Date(res.lastSyncTime));
      loadData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleBackup = async () => {
    setBacking(true);
    try {
      const res = await api.backupToGithub();
      addToast(`✅ ${res.message}`);
      // Also trigger download so user has the file
      window.location.href = api.downloadBackup();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setBacking(false);
    }
  };

  const formatTime = (date) => date
    ? date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  if (loading && !data) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <span>Cargando dashboard...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Resumen general del sistema de gestión médica</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={handleSyncEmail}
              disabled={syncing}
            >
              {syncing ? <><div className="spinner" style={{width: 16, height: 16}}></div> Sincronizando...</> : '📧 Sincronizar Correo'}
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handleBackup}
              disabled={backing}
              title="Genera un respaldo de la base de datos y lo descarga"
            >
              {backing ? <><div className="spinner" style={{width: 16, height: 16}}></div> Respaldando...</> : '💾 Respaldar Datos'}
            </button>
          </div>
          <span style={{
            fontSize: '12px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <span>🕐</span>
            <span>Última actualización: <strong style={{ color: 'var(--text-secondary)' }}>{formatTime(lastSync)}</strong></span>
          </span>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card purple">
          <div className="stat-icon">👨‍⚕️</div>
          <div className="stat-value">{data?.totalDoctors || 0}</div>
          <div className="stat-label">Doctores</div>
        </div>
        <div className="stat-card cyan">
          <div className="stat-icon">💊</div>
          <div className="stat-value">{data?.totalProducts || 0}</div>
          <div className="stat-label">Productos</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon">📦</div>
          <div className="stat-value">{data?.totalInventory || 0}</div>
          <div className="stat-label">Asignaciones</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon">🚨</div>
          <div className="stat-value">{data?.criticalAlerts || 0}</div>
          <div className="stat-label">Alertas Críticas</div>
        </div>
      </div>

      {/* RENDERIZADO DE GRÁFICAS DE ANALÍTICA */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        
        {/* Gráfica de Tendencia */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">📈 Tendencia de Recetas (Últimos 30 días)</h2>
          </div>
          <div style={{ height: 300, padding: '1rem', width: '100%' }}>
            {data?.salesTrend?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.salesTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" stroke="var(--text-muted)" tickFormatter={(tick) => tick.slice(5)} />
                  <YAxis stroke="var(--text-muted)" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                  <Line type="monotone" dataKey="total_quantity" name="Productos Recetados" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, stroke: '#4f46e5', fill: '#fff' }} activeDot={{ r: 8, fill: '#4f46e5' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">No hay suficientes datos de ventas para mostrar la tendencia.</div>
            )}
          </div>
        </div>

        {/* Gráfica de Barras (Ranking) */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">🏆 Top 5 Doctores del Mes</h2>
          </div>
          <div style={{ height: 300, padding: '1rem', width: '100%' }}>
            {data?.topDoctors?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topDoctors} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="var(--text-muted)" allowDecimals={false} />
                  <YAxis dataKey="doctor" type="category" width={100} stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                  <Bar dataKey="total_prescriptions" name="Recetas Emitidas" fill="#8884d8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">No hay datos de doctores este mes.</div>
            )}
          </div>
        </div>

      </div>

      {/* Historial Reciente de la Clínica */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">🧾 Ventas Recientes</h2>
        </div>
        {data?.recentSales?.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Fecha Venta</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map(sale => (
                  <tr key={sale.id}>
                    <td>{sale.doctor_name || '—'}</td>
                    <td>{sale.product_name}</td>
                    <td>{sale.quantity} Pza</td>
                    <td>{new Date(sale.sale_date).toLocaleDateString('es-MX', { timeZone: 'UTC' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <p className="empty-state-text">Sin ventas registradas</p>
            <p className="empty-state-hint">Sube un archivo TXT para comenzar a registrar ventas</p>
          </div>
        )}
      </div>

      {/* RUTERO INTELIGENTE (SEMÁFORO) */}
      <div className="card" style={{ marginTop: '24px', borderLeft: '4px solid var(--danger-color)' }}>
        <div className="card-header">
          <h2 className="card-title">🚦 Rutero Sugerido (Atención Requerida)</h2>
          <p className="page-subtitle" style={{margin: 0}}>Doctores con más de 30 días sin registrar recetas</p>
        </div>
        {data?.urgentDoctors?.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Prioridad</th>
                  <th>Doctor</th>
                  <th>Días de Inactividad</th>
                  <th>Última Receta</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.urgentDoctors.map(doc => {
                  const isUrgent = doc.inactive_days >= 45;
                  return (
                  <tr key={doc.id}>
                    <td>
                       <span style={{ 
                         padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold',
                         background: isUrgent ? '#fee2e2' : '#fef3c7',
                         color: isUrgent ? '#ef4444' : '#d97706'
                       }}>
                         {isUrgent ? '🔴 URGENTE' : '🟡 ATENCIÓN'}
                       </span>
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{doc.name}</td>
                    <td><strong style={{ color: isUrgent ? 'var(--danger-color)' : 'inherit'}}>{doc.inactive_days} días</strong></td>
                    <td>{new Date(doc.last_sale_date).toLocaleDateString('es-MX', { timeZone: 'UTC' })}</td>
                    <td>
                      <a href={`/doctors/${doc.id}`} className="btn btn-secondary btn-sm" style={{textDecoration: 'none'}}>Ver Perfil</a>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
             <div className="empty-state-icon">✅</div>
             <p className="empty-state-text">Todo al día</p>
             <p className="empty-state-hint">No hay doctores inactivos por más de 30 días.</p>
          </div>
        )}
      </div>
    </div>
  );
}
