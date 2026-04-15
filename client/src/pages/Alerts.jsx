import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(2);

  const load = () => {
    setLoading(true);
    api.getCriticalStock(threshold)
      .then(setAlerts)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [threshold]);

  return (
    <div className="alerts-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Crítico</h1>
          <p className="page-subtitle">Doctores con bajo inventario de muestras o vales</p>
        </div>
        <div className="btn-group">
          <div className="search-container" style={{ padding: '4px 12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold' }}>Umbral:</span>
            <input
              type="number"
              min="0"
              value={threshold}
              onChange={e => setThreshold(parseInt(e.target.value) || 0)}
              style={{ border: 'none', background: 'none', width: '60px', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 'bold' }}
            />
          </div>
          <button className="btn btn-secondary" onClick={load}>🔄</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Escaneando inventarios...</span></div>
      ) : alerts.length > 0 ? (
        <div className="alerts-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '8px' }}>
            <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '14px' }}>
              🚨 {alerts.length} ALERTA(S) ACTIVAS QUE REQUIEREN REPOSICIÓN
            </span>
          </div>

          {alerts.map(alert => {
            const pct = parseInt(alert.stock_percentage) || 0;
            return (
              <div key={alert.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
                  <div style={{ flex: 1, minWidth: '250px' }}>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      👨‍⚕️ {alert.doctor_name}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge badge-warning" style={{ borderRadius: '6px' }}>💊 {alert.product_name}</span>
                      {alert.doctor_phone && <span style={{ opacity: 0.7 }}>📞 {alert.doctor_phone}</span>}
                    </div>
                  </div>
                  
                  <div style={{ textAlign: 'right', minWidth: '150px' }}>
                    <div style={{ fontSize: '24px', fontWeight: '900', color: '#ef4444' }}>
                      {alert.current_stock} <span style={{ fontSize: '14px', opacity: 0.6 }}>/ {alert.target_stock} pzas</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-glass)', borderRadius: '10px', marginTop: '8px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: '#ef4444' }}></div>
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#ef4444', marginTop: '6px', textTransform: 'uppercase' }}>
                      {pct}% del stock objetivo
                    </div>
                  </div>
                  
                  <div className="btn-group">
                     <button className="btn btn-primary btn-sm" onClick={() => window.location.href=`/doctors/${alert.doctor_id}`}>Ver Doctor</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <p className="empty-state-text">Todo bajo control</p>
            <p className="empty-state-hint">No hay doctores por debajo del umbral de {threshold} piezas.</p>
          </div>
        </div>
      )}
    </div>
  );
}
  );
}
