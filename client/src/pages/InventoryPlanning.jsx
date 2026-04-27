import { useState, useEffect } from 'react';
import { api } from '../api';
import toast from 'react-hot-toast';

export default function InventoryPlanning() {
  const [suggestions, setSuggestions] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [activeTab, setActiveTab] = useState('suggestions'); // 'suggestions', 'history'

  const loadData = async () => {
    setLoading(true);
    try {
      const [sugData, histData] = await Promise.all([
        api.getSuggestedOrders(),
        api.getStockOutHistory()
      ]);
      
      if (sugData && sugData.error) throw new Error(sugData.error);
      if (histData && histData.error) throw new Error(histData.error);

      setSuggestions(Array.isArray(sugData) ? sugData : []);
      setHistory(Array.isArray(histData) ? histData : []);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error al cargar datos de planificación');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRecalculate = async () => {
    if (!confirm('¿Deseas recalcular los stocks mínimos basados en las ventas de los últimos 90 días?')) return;
    
    setRecalculating(true);
    try {
      const res = await api.recalculateMinStock({ safetyDays: 15, ranking: 'AA,A' });
      toast.success(res.message);
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRecalculating(false);
    }
  };

  const exportToExcel = () => {
    // Basic implementation using a CSV blob for simplicity in this demo, 
    // but could use a specialized library or backend endpoint
    const headers = ['Producto', 'Ranking', 'Stock Actual', 'Stock Min', 'Stock Ideal', 'Sugerido'];
    const rows = suggestions.map(s => [
      s.name, 
      s.ranking, 
      s.stock, 
      s.min_stock, 
      s.target_used, 
      s.suggested_qty
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Orden_Sugerida_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="planning-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Planeación de Inventario</h1>
          <p className="page-subtitle">Optimización de existencias y prevención de desabasto</p>
        </div>
        <div className="btn-group">
          <button 
            className="btn btn-secondary" 
            onClick={handleRecalculate} 
            disabled={recalculating}
            style={{ borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}
          >
            {recalculating ? <div className="spinner" style={{width: 14, height: 14}}></div> : '🧠 Recalcular Mínimos (IA)'}
          </button>
          <button className="btn btn-primary" onClick={exportToExcel} disabled={suggestions.length === 0}>
            📥 Descargar Orden Sugerida
          </button>
        </div>
      </div>

      <div className="tabs-container" style={{ marginBottom: '24px' }}>
        <div className="tabs" style={{ display: 'flex', gap: '8px', background: 'var(--bg-glass)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border-color)', width: 'fit-content' }}>
          <button 
            className={`tab-btn ${activeTab === 'suggestions' ? 'active' : ''}`}
            onClick={() => setActiveTab('suggestions')}
          >
            📦 Sugerencias de Resurtido
          </button>
          <button 
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📉 Historial de Quiebres
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Analizando inventario...</span></div>
      ) : activeTab === 'suggestions' ? (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">🛍️ Productos a Ordenar ({suggestions.length})</h2>
          </div>
          {suggestions.length > 0 ? (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Ranking</th>
                    <th>Producto</th>
                    <th style={{ textAlign: 'center' }}>Stock Actual</th>
                    <th style={{ textAlign: 'center' }}>Mínimo</th>
                    <th style={{ textAlign: 'center' }}>Ideal</th>
                    <th style={{ textAlign: 'center', backgroundColor: 'rgba(var(--primary-rgb), 0.05)' }}>📦 Sugerido</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s, idx) => {
                    const isAA = s.ranking === 'AA' || s.ranking === 'A';
                    return (
                      <tr key={idx} style={{ borderLeft: isAA ? '4px solid #10b981' : '4px solid transparent' }}>
                        <td><span className={`badge ${isAA ? 'badge-success' : 'badge-warning'}`}>{s.ranking || '—'}</span></td>
                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                        <td style={{ textAlign: 'center' }}>{s.stock}</td>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{s.min_stock}</td>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{s.target_used}</td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--primary-color)', backgroundColor: 'rgba(var(--primary-rgb), 0.02)' }}>
                           {s.suggested_qty}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <p className="empty-state-text">Todo en orden</p>
              <p className="empty-state-hint">No hay productos por debajo del stock ideal.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
           <div className="card-header">
            <h2 className="card-title">📉 Registro de Faltantes</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Eventos detectados donde el stock llegó a cero.</p>
          </div>
          {history.length > 0 ? (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Inicio Quiebre</th>
                    <th>Fin Quiebre</th>
                    <th>Duración</th>
                    <th style={{ textAlign: 'right' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, idx) => {
                    const start = new Date(h.start_date);
                    const end = h.end_date ? new Date(h.end_date) : null;
                    const duration = end 
                      ? Math.ceil((end - start) / (1000 * 60 * 60 * 24))
                      : Math.ceil((new Date() - start) / (1000 * 60 * 60 * 24));
                    
                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{h.product_name} <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({h.ranking})</span></td>
                        <td>{start.toLocaleDateString()} {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{end ? `${end.toLocaleDateString()} ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '—'}</td>
                        <td>{duration} días</td>
                        <td style={{ textAlign: 'right' }}>
                          {end 
                            ? <span className="badge badge-secondary" style={{ opacity: 0.7 }}>Solucionado</span>
                            : <span className="badge badge-danger">⚠️ Activo</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🛡️</div>
              <p className="empty-state-text">Sin quiebres registrados</p>
              <p className="empty-state-hint">No se han detectado periodos sin existencias recientemente.</p>
            </div>
          )}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .planning-container { animation: fadeIn 0.5s ease; }
        .tab-btn { 
          background: none; 
          border: none; 
          padding: 8px 20px; 
          border-radius: 8px; 
          color: var(--text-muted); 
          font-size: 13px; 
          font-weight: 700; 
          cursor: pointer; 
          transition: 0.2s; 
        }
        .tab-btn.active { 
          background: var(--primary-color); 
          color: white; 
          box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.3); 
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
    </div>
  );
}
