import { useState, useEffect } from 'react';
import { api } from '../api';

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
    </div>
  );
}
