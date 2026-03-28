import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('TAMPICO');

  useEffect(() => {
    api.getBranches()
      .then(setBranches)
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    api.getSales(500, 0, selectedBranch)
      .then(setSales)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedBranch]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Historial de Ventas</h1>
          <p className="page-subtitle">Registro de ventas por sucursal</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select 
            className="btn btn-secondary" 
            style={{ padding: '8px 12px', cursor: 'pointer' }}
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
          >
            <option value="TODAS">🌍 Todas las Sucursales</option>
            <option value="TAMPICO">🏥 TAMPICO</option>
            {branches.filter(b => b !== 'TAMPICO').map(b => (
              <option key={b} value={b}>📍 {b}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={() => window.location.href = api.exportSalesExcel(selectedBranch)}>📥 Exportar a Excel</button>
        </div>
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
                  <th>Sucursal</th>
                  <th>Cantidad</th>
                  <th>Fecha Venta</th>
                  <th>Procesado el</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => (
                  <tr key={sale.id}>
                    <td style={{ color: 'var(--text-muted)' }}>{sale.id}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sale.doctor_name || '—'}</td>
                    <td>{sale.product_name || '—'}</td>
                    <td style={{ fontSize: 13 }}>{sale.sucursal || '—'}</td>
                    <td>{sale.quantity} Pza</td>
                    <td>{new Date(sale.sale_date).toLocaleDateString('es-MX', { timeZone: 'UTC' })}</td>
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
