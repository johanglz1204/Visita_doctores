import { useState, useEffect } from 'react';
import { api } from '../api';
import toast from 'react-hot-toast';

export default function ProductMapping() {
  const [unmatched, setUnmatched] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerms, setSearchTerms] = useState({});
  const [searchResults, setSearchResults] = useState({});
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'active'

  const loadData = async () => {
    setLoading(true);
    try {
      const status = await api.syncStatus();
      setUnmatched(status.unmatched_list || []);
      
      const aliasList = await api.getAliases();
      setAliases(aliasList || []);
    } catch (err) {
      toast.error('Error al cargar datos de mapeo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSearch = async (unmatchedName, query) => {
    setSearchTerms(prev => ({ ...prev, [unmatchedName]: query }));
    if (query.length < 2) {
      setSearchResults(prev => ({ ...prev, [unmatchedName]: [] }));
      return;
    }

    try {
      const results = await api.searchProductsForMapping(query);
      setSearchResults(prev => ({ ...prev, [unmatchedName]: results }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMap = async (unmatchedName, product) => {
    try {
      const res = await api.mapProduct(unmatchedName, product.id);
      toast.success(res.message);
      loadData();
      // Clear search for this item
      setSearchTerms(prev => {
        const next = { ...prev };
        delete next[unmatchedName];
        return next;
      });
    } catch (err) {
      toast.error('Error al crear el vínculo');
    }
  };

  const handleDeleteAlias = async (id) => {
    if (!confirm('¿Eliminar este vínculo manual?')) return;
    try {
      await api.deleteAlias(id);
      toast.success('Vínculo eliminado');
      loadData();
    } catch (err) {
      toast.error('Error al eliminar');
    }
  };

  return (
    <div className="mapping-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Centro de Mapeo</h1>
          <p className="page-subtitle">Vincula productos de MySQL que no tienen match automático</p>
        </div>
        <div className="tab-group">
          <button 
            className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Pendientes ({unmatched.length})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Vínculos Activos ({aliases.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div></div>
      ) : activeTab === 'pending' ? (
        <div className="mapping-grid">
          {unmatched.length > 0 ? (
            unmatched.map((item, idx) => (
              <div key={idx} className="card mapping-card">
                <div className="mapping-source">
                  <span className="source-label">Producto en MySQL</span>
                  <h3 className="source-name">{item.nombre}</h3>
                  <div className="source-meta">
                    <span className="badge badge-secondary">{item.codigo || 'Sin Código'}</span>
                    <span className="stock-tag">Existencia: {item.existencia}</span>
                  </div>
                </div>
                
                <div className="mapping-target">
                  <span className="source-label">Vincular con SICOIN</span>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Buscar producto por nombre..."
                    value={searchTerms[item.nombre] || ''}
                    onChange={(e) => handleSearch(item.nombre, e.target.value)}
                  />
                  
                  {searchResults[item.nombre]?.length > 0 && (
                    <div className="search-results-dropdown">
                      {searchResults[item.nombre].map(p => (
                        <div key={p.id} className="search-result-item" onClick={() => handleMap(item.nombre, p)}>
                          <div className="result-info">
                            <span className="result-name">{p.name}</span>
                            <span className="result-meta">{p.barcode} • Stock: {p.stock}</span>
                          </div>
                          <button className="btn-link">Vincular</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">✨</div>
              <p>No hay productos pendientes de mapeo.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nombre en MySQL (Alias)</th>
                  <th>Producto SICOIN</th>
                  <th>Fecha</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {aliases.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.alias_name}</td>
                    <td>
                      <div className="flex-column">
                        <span style={{ fontWeight: 500 }}>{a.product_name}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: {a.product_id}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: '12px' }}>{new Date(a.created_at).toLocaleDateString()}</td>
                    <td>
                      <button className="btn-icon delete" onClick={() => handleDeleteAlias(a.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .mapping-container { animation: fadeIn 0.5s ease; }
        .tab-group { display: flex; gap: 8px; background: var(--bg-glass); padding: 4px; border-radius: 12px; border: 1px solid var(--border-color); }
        .tab-btn { background: none; border: none; padding: 8px 16px; border-radius: 8px; color: var(--text-muted); font-weight: 700; cursor: pointer; transition: 0.2s; }
        .tab-btn.active { background: var(--primary-color); color: white; }
        
        .mapping-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 20px; }
        .mapping-card { padding: 20px; display: flex; flex-direction: column; gap: 16px; border-left: 4px solid var(--primary-color); }
        .source-label { font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 800; letter-spacing: 0.5px; display: block; margin-bottom: 4px; }
        .source-name { font-size: 16px; margin: 0; font-weight: 700; }
        .source-meta { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
        .stock-tag { font-size: 12px; color: var(--primary-color); font-weight: 700; }
        
        .mapping-target { position: relative; background: rgba(var(--primary-rgb), 0.05); padding: 12px; border-radius: 12px; }
        .search-results-dropdown { 
          position: absolute; top: 100%; left: 0; right: 0; z-index: 100;
          background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px;
          margin-top: 4px; box-shadow: var(--shadow-lg); max-height: 250px; overflow-y: auto;
        }
        .search-result-item { 
          padding: 10px 15px; display: flex; justify-content: space-between; align-items: center;
          cursor: pointer; border-bottom: 1px solid var(--border-color);
        }
        .search-result-item:hover { background: rgba(var(--primary-rgb), 0.05); }
        .result-info { display: flex; flex-direction: column; }
        .result-name { font-weight: 600; font-size: 14px; }
        .result-meta { font-size: 11px; color: var(--text-muted); }
        .btn-link { background: none; border: none; color: var(--primary-color); font-weight: 700; cursor: pointer; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
    </div>
  );
}
