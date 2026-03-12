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
    <div>
      <div className="page-header">
        <h1 className="page-title">Alertas de Stock Crítico</h1>
        <p className="page-subtitle">Doctores que necesitan reposición de vales o muestras físicas</p>
      </div>

      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Umbral mínimo:</label>
        <input
          className="form-input"
          type="number"
          min="0"
          value={threshold}
          onChange={e => setThreshold(parseInt(e.target.value) || 0)}
          style={{ width: 80 }}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>piezas (o ≤20% del objetivo)</span>
        <button className="btn btn-secondary btn-sm" onClick={load}>🔄 Refrescar</button>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Cargando...</span></div>
      ) : alerts.length > 0 ? (
        <div>
          <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <span style={{ color: 'var(--accent-danger)', fontWeight: 600 }}>
              ⚠️ {alerts.length} asignación(es) con stock crítico
            </span>
          </div>

          {alerts.map(alert => {
            const pct = parseInt(alert.stock_percentage) || 0;
            return (
              <div key={alert.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>
                      👨‍⚕️ {alert.doctor_name}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                      💊 {alert.product_name} <span className="badge badge-info">{alert.product_presentation}</span>
                    </div>
                    {alert.doctor_phone && (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                        📞 {alert.doctor_phone}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 180 }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-danger)' }}>
                      {alert.current_stock} / {alert.target_stock}
                    </div>
                    <div className="stock-bar-container" style={{ width: 180 }}>
                      <div className="stock-bar danger" style={{ width: `${Math.min(pct, 100)}%` }}></div>
                    </div>
                    <span className="badge badge-danger" style={{ marginTop: 8 }}>
                      {pct}% — Requiere reposición
                    </span>
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
            <p className="empty-state-text">Sin alertas de stock crítico</p>
            <p className="empty-state-hint">Todos los doctores tienen stock suficiente</p>
          </div>
        </div>
      )}
    </div>
  );
}
