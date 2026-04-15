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
    <div className="sales-container">
      <div className="page-header" style={{ flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 className="page-title">Historial de Ventas</h1>
          <p className="page-subtitle">Registro centralizado de recetas y movimientos</p>
        </div>
        <div className="btn-group" style={{ flexWrap: 'wrap' }}>
          <div className="search-container" style={{ padding: '4px 12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>Desde:</span>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ border: 'none', background: 'none', color: 'var(--text-primary)', fontSize: '13px' }} />
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>Hasta:</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ border: 'none', background: 'none', color: 'var(--text-primary)', fontSize: '13px' }} />
          </div>

          <select 
            className="form-input" 
            style={{ width: 'auto', minWidth: '180px' }}
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
          >
            <option value="TODAS">🌍 Todas las Sucursales</option>
            <option value="TAMPICO">🏥 TAMPICO</option>
            {branches.filter(b => b !== 'TAMPICO').map(b => (
              <option key={b} value={b}>📍 {b}</option>
            ))}
          </select>

          <button className="btn btn-primary" onClick={() => window.location.href = api.exportSalesExcel(selectedBranch, startDate, endDate)}>📥 Exportar</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">🧾 Ventas Registradas ({totalSales})</h2>
          {totalSales > 0 && (
            <div className="btn-group">
              <button 
                className="btn btn-secondary btn-sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                Anterior
              </button>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>{currentPage} de {Math.ceil(totalSales / 50)}</span>
              <button 
                className="btn btn-secondary btn-sm" 
                disabled={currentPage * 50 >= totalSales}
                onClick={() => setCurrentPage(prev => prev + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="loading-container"><div className="spinner"></div><span>Cargando historial...</span></div>
        ) : sales.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Producto</th>
                  <th>Sucursal</th>
                  <th>Cant.</th>
                  <th>Fecha Venta</th>
                  <th style={{ textAlign: 'right' }}>Registro</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => (
                  <tr key={sale.id}>
                    <td style={{ fontWeight: 600 }}>{sale.doctor_name || '—'}</td>
                    <td>{sale.product_name || '—'}</td>
                    <td><span className="badge badge-secondary" style={{ background: 'var(--bg-glass)', fontSize: '11px' }}>{sale.sucursal || '—'}</span></td>
                    <td style={{ fontWeight: 700 }}>{sale.quantity}</td>
                    <td>{new Date(sale.sale_date).toLocaleDateString('es-MX', { timeZone: 'UTC' })}</td>
                    <td style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(sale.created_at).toLocaleString('es-MX')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <p className="empty-state-text">No hay movimientos en este periodo</p>
            <p className="empty-state-hint">Ajusta los filtros o selecciona otra sucursal</p>
          </div>
        )}
      </div>
    </div>
  );
}
