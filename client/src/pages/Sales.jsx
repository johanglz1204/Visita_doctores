import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSales(100, 0)
      .then(setSales)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Historial de Ventas</h1>
        <p className="page-subtitle">Registro completo de ventas procesadas desde archivos TXT</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">🧾 Ventas ({sales.length})</h2>
        </div>

        {loading ? (
          <div className="loading-container"><div className="spinner"></div><span>Cargando...</span></div>
        ) : sales.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Doctor</th>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Fecha Venta</th>
                  <th>Procesado</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => (
                  <tr key={sale.id}>
                    <td style={{ color: 'var(--text-muted)' }}>{sale.id}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sale.doctor_name || '—'}</td>
                    <td>{sale.product_name || '—'} {sale.product_presentation ? <span className="badge badge-info" style={{ marginLeft: 4 }}>{sale.product_presentation}</span> : ''}</td>
                    <td>{sale.quantity} Pza</td>
                    <td>{new Date(sale.sale_date).toLocaleDateString('es-MX')}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{new Date(sale.created_at).toLocaleString('es-MX')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <p className="empty-state-text">No hay ventas registradas</p>
            <p className="empty-state-hint">Las ventas se registran automáticamente al subir archivos TXT</p>
          </div>
        )}
      </div>
    </div>
  );
}
