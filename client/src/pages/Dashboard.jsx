import { useState, useEffect } from 'react';
import { api } from '../api';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import StatCard from '../components/dashboard/StatCard';
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton';

export default function Dashboard({ addToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [backing, setBacking] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const loadData = (showLoading = true) => {
    if (showLoading) setLoading(true);
    api.getDashboard()
      .then(d => {
        setData(d);
        if (d.lastSyncTime) setLastSync(new Date(d.lastSyncTime));
      })
      .catch(err => {
        console.error(err);
        addToast('Error al conectar con el servidor', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(false), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncEmail = async () => {
    setSyncing(true);
    try {
      const res = await api.syncEmails();
      addToast(res.message);
      if (res.lastSyncTime) setLastSync(new Date(res.lastSyncTime));
      loadData(false);
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

  if (loading && !data) return <DashboardSkeleton />;

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Panel de analítica y gestión de inventario</p>
        </div>
        <div className="header-actions">
          <div className="button-group">
            <button className="btn btn-secondary" onClick={handleSyncEmail} disabled={syncing}>
              {syncing ? <div className="spinner" style={{width: 14, height: 14}}></div> : '📧'} Sincronizar
            </button>
            <button className="btn btn-primary" onClick={handleBackup} disabled={backing}>
              {backing ? <div className="spinner" style={{width: 14, height: 14}}></div> : '💾'} Respaldar
            </button>
          </div>
          <div className="last-sync-tag">
            <span>🕐</span> Última sync: <strong>{formatTime(lastSync)}</strong>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard title="Doctores" value={data?.totalDoctors} icon="👨‍⚕️" colorClass="purple" />
        <StatCard title="Productos" value={data?.totalProducts} icon="💊" colorClass="cyan" />
        <StatCard title="Inventario" value={data?.totalInventory} icon="📦" colorClass="green" />
        <StatCard title="Alertas" value={data?.criticalAlerts} icon="🚨" colorClass="red" />
      </div>

      <div className="charts-grid">
        <div className="card chart-card">
          <div className="card-header">
            <h2 className="card-title">📈 Tendencia Semanal</h2>
          </div>
          <div className="chart-container">
            {data?.salesTrend?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.salesTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="date" stroke="var(--text-muted)" tickFormatter={(t) => t.split('-').slice(1).join('/')} />
                  <YAxis stroke="var(--text-muted)" />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)' }} />
                  <Line type="monotone" dataKey="total_quantity" stroke="var(--primary-color)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} animationDuration={1500} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="empty-chart">Sin datos suficientes</div>}
          </div>
        </div>

        <div className="card chart-card">
          <div className="card-header">
            <h2 className="card-title">🏆 Top Doctores</h2>
          </div>
          <div className="chart-container">
            {data?.topDoctors?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.topDoctors} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="doctor" type="category" width={80} style={{ fontSize: '11px' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)' }} />
                  <Bar dataKey="total_prescriptions" fill="var(--primary-color)" radius={[0, 4, 4, 0]} animationDuration={1500} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="empty-chart">Sin datos del mes</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">🧾 Movimientos Recientes</h2>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Doctor</th>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {data?.recentSales?.map(sale => (
                <tr key={sale.id}>
                  <td style={{ fontWeight: 600 }}>{sale.doctor_name || 'Generico'}</td>
                  <td>{sale.product_name}</td>
                  <td>{sale.quantity}</td>
                  <td>{new Date(sale.sale_date).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <h2 className="card-title">🚦 Rutero Sugerido (Atención Requerida)</h2>
        </div>
        {data?.urgentDoctors?.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Prioridad</th>
                  <th>Doctor</th>
                  <th>Días Inactividad</th>
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
                          padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '800',
                          background: isUrgent ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: isUrgent ? '#ef4444' : '#f59e0b',
                          border: `1px solid ${isUrgent ? '#ef4444' : '#f59e0b'}`
                        }}>
                          {isUrgent ? '🔴 URGENTE' : '🟡 ATENCIÓN'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{doc.name}</td>
                      <td><span style={{ color: isUrgent ? '#ef4444' : 'inherit', fontWeight: 'bold' }}>{doc.inactive_days} días</span></td>
                      <td>{new Date(doc.last_sale_date).toLocaleDateString('es-MX')}</td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => window.location.href=`/doctors/${doc.id}`}>Ver Perfil</button>
                      </td>
                    </tr>
                  )
                })}
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

      <style dangerouslySetInnerHTML={{ __html: `
        .dashboard-container { animation: fadeIn 0.5s ease; }
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; flex-wrap: wrap; gap: 16px; }
        .header-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .button-group { display: flex; gap: 12px; }
        .last-sync-tag { font-size: 12px; color: var(--text-muted); background: var(--bg-glass); padding: 4px 12px; border-radius: 20px; border: 1px solid var(--border-color); }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 32px; }
        .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px; margin-bottom: 24px; }
        .chart-container { padding: 16px; min-height: 300px; display: flex; align-items: center; justify-content: center; }
        .empty-chart { color: var(--text-muted); font-style: italic; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        @media (max-width: 600px) {
          .page-header { flex-direction: column; align-items: flex-start; }
          .header-actions { align-items: flex-start; width: 100%; }
          .button-group { width: 100%; }
          .btn { flex: 1; }
        }
      `}} />
    </div>
  );
}
