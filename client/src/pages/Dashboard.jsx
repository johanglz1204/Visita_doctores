import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
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
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Resumen general del sistema de gestión médica</p>
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
                    <td>{sale.product_name} {sale.presentation}</td>
                    <td>{sale.quantity} Pza</td>
                    <td>{new Date(sale.sale_date).toLocaleDateString('es-MX')}</td>
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
