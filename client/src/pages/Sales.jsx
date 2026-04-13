import { useState, useEffect } from 'react';
import { api } from '../api';
import toast from 'react-hot-toast';

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [totalSales, setTotalSales] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('todas');
  
  const defaultStart = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
  const defaultEnd = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  useEffect(() => {
    api.getBranches()
      .then(setBranches)
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    const limit = 50;
    const offset = (currentPage - 1) * limit;
    api.getSales(limit, offset, selectedBranch, startDate, endDate)
      .then(res => {
        // Soporte temporal si el backend aún devuelve Array en vez de {data, total}
        if (Array.isArray(res)) {
           setSales(res);
           setTotalSales(res.length);
        } else {
           setSales(res.data || []);
           setTotalSales(res.total || 0);
        }
      })
      .catch(err => {
        console.error(err);
        toast.error('Error al cargar historial de ventas');
      })
      .finally(() => setLoading(false));
  }, [selectedBranch, currentPage, startDate, endDate]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Historial de Ventas</h1>
          <p className="page-subtitle">Registro de ventas por sucursal</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--bg-glass)', padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Desde:</label>
              <input type="date" className="btn btn-secondary" style={{ padding: '4px', margin: 0, border: 'none' }} value={startDate} onChange={e => setStartDate(e.target.value)} />
              
              <label style={{ fontSize: '13px', fontWeight: 'bold', marginLeft: '10px' }}>Hasta:</label>
              <input type="date" className="btn btn-secondary" style={{ padding: '4px', margin: 0, border: 'none' }} value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>

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
          <button className="btn btn-primary" onClick={() => window.location.href = api.exportSalesExcel(selectedBranch, startDate, endDate)}>📥 Exportar a Excel</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="card-title">🧾 Ventas ({totalSales})</h2>
          {totalSales > 0 && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button 
                className="btn btn-secondary" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                Anterior
              </button>
              <span style={{ fontSize: '14px', fontWeight: '500' }}>Página {currentPage}</span>
              <button 
                className="btn btn-secondary" 
                disabled={currentPage * 50 >= totalSales}
                onClick={() => setCurrentPage(prev => prev + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
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
