import { useState, useEffect } from 'react';
import { api } from '../api';
import toast from 'react-hot-toast';

export default function InventoryPlanning() {
  const [decliningProducts, setDecliningProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 50;

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getProducts();
      if (!data) throw new Error('No data received');

      const declining = [];
      data.forEach(p => {
        const sm = p.sales_metrics || {};
        let total_last = 0;
        let total_prev = 0;
        
        Object.values(sm).forEach(b => {
          total_last += (b.total_90d || 0);
          total_prev += (b.prev_90d || 0);
        });

        const pRank = p.prev_ranking;
        const cRank = p.ranking;
        const isTargetDrop = (pRank === 'A' && cRank === 'B') ||
                             (pRank === 'B' && cRank === 'C') ||
                             (pRank === 'C' && cRank === 'E');

        if (isTargetDrop) {
          const dropPercent = total_prev > 0 ? Math.round(((total_prev - total_last) / total_prev) * 100) : 100;
          declining.push({
            ...p,
            total_last,
            total_prev,
            dropPercent
          });
        }
      });

      // Sort by drop percentage descending
      declining.sort((a, b) => b.dropPercent - a.dropPercent);
      setDecliningProducts(declining);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar datos de estrategias');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const exportToExcel = () => {
    const headers = ['Producto', 'Ranking', 'Ventas (Hace 4-6 meses)', 'Ventas (Ultimos 3 meses)', 'Caída (%)'];
    const rows = decliningProducts.map(s => [
      s.name.replace(/,/g, ''), 
      s.ranking, 
      s.total_prev, 
      s.total_last, 
      `-${s.dropPercent}%`
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Estrategias_Venta_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="planning-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Estrategias de Venta</h1>
          <p className="page-subtitle">Detección de productos en declive para impulsar su rotación</p>
        </div>
        <div className="btn-group">
          <button className="btn btn-primary" onClick={exportToExcel} disabled={decliningProducts.length === 0}>
            📥 Descargar Reporte
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Analizando historia de ventas...</span></div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">📉 Productos que requieren acción ({decliningProducts.length})</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Estos productos han vendido menos en los últimos 3 meses comparado con el trimestre anterior.</p>
          </div>
          {decliningProducts.length > 0 ? (
            <div className="table-wrapper">
              {(() => {
                const totalPages = Math.ceil(decliningProducts.length / productsPerPage);
                const indexOfLastProduct = currentPage * productsPerPage;
                const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
                const currentProducts = decliningProducts.slice(indexOfFirstProduct, indexOfLastProduct);
                
                return (
                  <>
                    <table>
                <thead>
                  <tr>
                    <th>Ranking</th>
                    <th>Producto</th>
                    <th style={{ textAlign: 'center' }}>Hace 4-6 Meses</th>
                    <th style={{ textAlign: 'center' }}>Últimos 3 Meses</th>
                    <th style={{ textAlign: 'center', color: '#ef4444' }}>Caída</th>
                  </tr>
                </thead>
                <tbody>
                  {currentProducts.map((p, idx) => {
                    const isSevere = p.dropPercent > 50;
                    return (
                      <tr key={idx} style={{ borderLeft: isSevere ? '4px solid #ef4444' : '4px solid transparent', backgroundColor: isSevere ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                        <td><span className="badge badge-warning">{p.ranking || '—'}</span></td>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{p.total_prev} pzas</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{p.total_last} pzas</td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: '#ef4444' }}>
                           -{p.dropPercent}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', padding: '10px' }}>
                <button 
                  className="btn btn-secondary" 
                  disabled={currentPage === 1} 
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  Anterior
                </button>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                  Página {currentPage} de {totalPages || 1}
                </span>
                <button 
                  className="btn btn-secondary" 
                  disabled={currentPage === totalPages || totalPages === 0} 
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </>
          );
        })()}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <p className="empty-state-text">Todo en orden</p>
              <p className="empty-state-hint">No hay productos con caída de ventas.</p>
            </div>
          )}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .planning-container { animation: fadeIn 0.5s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
    </div>
  );
}
