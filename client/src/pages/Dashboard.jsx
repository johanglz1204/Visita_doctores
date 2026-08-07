import { useState, useEffect } from 'react';
import { api } from '../api';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import StatCard from '../components/dashboard/StatCard';
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function Dashboard({ addToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [branchFilter, setBranchFilter] = useState('all');
  const [backing, setBacking] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [activeTab, setActiveTab] = useState('resumen');

  const BRANCHES = ['MATRIZ', 'TAMPICO', 'CIVIL', 'EJERCITO', 'CURVA TEXAS'];

  const loadData = (showLoading = true, range = days, branch = branchFilter) => {
    if (showLoading) setLoading(true);
    api.getDashboard(range, branch)
      .then(d => {
        setData(d);
        if (d.lastSyncTime) setLastSync(new Date(d.lastSyncTime));
      })
      .catch(err => {
        console.error(err);
        addToast('Error al conectar con el servidor', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData(true, days, branchFilter);
    const interval = setInterval(() => loadData(false, days, branchFilter), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [days, branchFilter]);


  const handleBackup = async () => {
    setBacking(true);
    try {
      const res = await api.backupToGithub();
      addToast(`✅ ${res.message}`);
      window.location.href = api.downloadBackup();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setBacking(false);
    }
  };

  const formatTime = (date) => date
    ? date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  if (loading && !data) return <DashboardSkeleton />;

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Analítico</h1>
          <p className="page-subtitle">Visualización inteligente de operaciones y tendencias</p>
        </div>
        <div className="header-actions">
           <div className="time-selector">
              {[7, 30, 90].map(d => (
                <button 
                  key={d} 
                  className={`time-btn ${days === d ? 'active' : ''}`}
                  onClick={() => setDays(d)}
                >
                  {d}d
                </button>
              ))}
           </div>
           <select 
             className="form-input" 
             style={{ width: 'auto', minWidth: '160px', borderRadius: '12px', marginLeft: '12px' }}
             value={branchFilter}
             onChange={(e) => setBranchFilter(e.target.value)}
           >
             <option value="all">🌍 Todas las Sucursales</option>
             {BRANCHES.map(b => (
               <option key={b} value={b}>📍 {b}</option>
             ))}
           </select>
          <div className="button-group">
            <button className="btn btn-primary" onClick={() => api.downloadExecutiveReport(days)}>
              📄 Reporte Ejecutivo
            </button>
          </div>
        </div>
      </div>

      <div className="tabs-container" style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'var(--bg-glass)', padding: '6px', borderRadius: '16px', border: '1px solid var(--border-color)', width: 'fit-content' }}>
        <button 
          className={`tab-button ${activeTab === 'resumen' ? 'active' : ''}`}
          onClick={() => setActiveTab('resumen')}
          style={{ padding: '8px 24px', borderRadius: '12px', border: 'none', background: activeTab === 'resumen' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'resumen' ? 'white' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
        >
          📊 Resumen
        </button>
        <button 
          className={`tab-button ${activeTab === 'doctores' ? 'active' : ''}`}
          onClick={() => setActiveTab('doctores')}
          style={{ padding: '8px 24px', borderRadius: '12px', border: 'none', background: activeTab === 'doctores' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'doctores' ? 'white' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
        >
          🏆 Top Doctores
        </button>
        <button 
          className={`tab-button ${activeTab === 'inventario' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventario')}
          style={{ padding: '8px 24px', borderRadius: '12px', border: 'none', background: activeTab === 'inventario' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'inventario' ? 'white' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }}
        >
          📦 Inventario
          {data?.criticalRankedProducts?.length > 0 && (
            <span style={{ position: 'absolute', top: '2px', right: '4px', background: '#ef4444', color: 'white', fontSize: '10px', borderRadius: '50%', padding: '2px 6px' }}>{data.criticalRankedProducts.length}</span>
          )}
        </button>
      </div>

      {activeTab === 'resumen' && (
        <>
          <div className="stats-grid">
            <StatCard title="Doctores" value={data?.totalDoctors} icon="👨‍⚕️" colorClass="purple" />
            <StatCard title="Productos" value={data?.totalProducts} icon="💊" colorClass="cyan" />
            <StatCard 
              title="Ventas Periodo" 
              value={Math.round(data?.salesTrend?.reduce((acc, curr) => acc + (curr.total_quantity || 0), 0)).toLocaleString()} 
              icon="📈" 
              colorClass="green" 
              trend={data?.growth} 
            />
            <StatCard title="AA/A en Riesgo" value={data?.criticalRankedProducts?.length ?? 0} icon="🚨" colorClass="red" />
          </div>

          <div className="charts-main-grid">
            <div className="card chart-card wide">
              <div className="card-header">
                <h2 className="card-title">📈 Evolución de Prescripciones ({days} días)</h2>
              </div>
              <div className="chart-container">
                {data?.salesTrend?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data.salesTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                      <XAxis dataKey="date" stroke="var(--text-muted)" tickFormatter={(t) => t.split('-').slice(1).join('/')} />
                      <YAxis stroke="var(--text-muted)" />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)' }} />
                      <Line type="monotone" dataKey="total_quantity" stroke="var(--primary-color)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} animationDuration={1500} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <div className="empty-chart">Sin datos suficientes</div>}
              </div>
            </div>
            
            <div className="card chart-card">
              <div className="card-header">
                <h2 className="card-title">📍 Por Sucursal</h2>
              </div>
              <div className="chart-container">
                {data?.sucursalStats?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={data.sucursalStats}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {data.sucursalStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div className="empty-chart">Sin datos regionales</div>}
              </div>
            </div>

            <div className="card chart-card">
              <div className="card-header">
                <h2 className="card-title">🏷️ Desempeño por Línea</h2>
              </div>
              <div className="chart-container">
                {data?.lineStats?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.lineStats} layout="vertical">
                      <XAxis type="number" hide />
                      <YAxis dataKey="line" type="category" width={100} style={{ fontSize: '11px' }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="var(--primary-color)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="empty-chart">Sin datos de líneas</div>}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'doctores' && (
        <div className="charts-main-grid">
          <div className="card chart-card wide" style={{ gridColumn: '1 / -1' }}>
            <div className="card-header">
              <h2 className="card-title">🏆 Top Prescriptores ({days} días)</h2>
            </div>
            <div className="chart-container" style={{ height: '400px' }}>
              {data?.topDoctors?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topDoctors} layout="vertical" margin={{ left: 100 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="doctor" type="category" width={150} style={{ fontSize: '12px', fontWeight: 600 }} />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '8px' }} />
                    <Bar dataKey="total_prescriptions" fill="var(--primary-color)" radius={[0, 4, 4, 0]}>
                      {data.topDoctors.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="empty-chart">Sin datos del periodo</div>}
            </div>
          </div>
          
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-header">
              <h2 className="card-title">⚠️ Alertas de Retención (Doctores inactivos)</h2>
            </div>
            {data?.urgentDoctors?.length > 0 ? (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Prioridad</th>
                      <th>Doctor</th>
                      <th>Inactividad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.urgentDoctors.slice(0, 6).map(doc => {
                      const isUrgent = doc.inactive_days >= 45;
                      return (
                        <tr key={doc.id}>
                          <td>
                            <div className={`status-dot ${isUrgent ? 'red' : 'orange'}`}></div>
                          </td>
                          <td style={{ fontWeight: 600 }}>{doc.name}</td>
                          <td style={{ color: isUrgent ? '#ef4444' : 'inherit', fontWeight: 'bold' }}>{doc.inactive_days} d</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '20px' }}>
                <p>No hay alertas de retención activas.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'inventario' && (
        <>
          {data?.criticalRankedProducts?.length > 0 && (
            <div className="card" style={{ marginBottom: '24px', border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.04)' }}>
              <div className="card-header" style={{ borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
                <h2 className="card-title" style={{ color: '#ef4444' }}>🚨 Riesgo de Desabasto — Productos AA / A</h2>
                <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 700 }}>{data.criticalRankedProducts.length} producto(s) bajo mínimo</span>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Ranking</th>
                      <th>Producto</th>
                      <th style={{ textAlign: 'center' }}>Stock Actual</th>
                      <th style={{ textAlign: 'center' }}>Stock Mínimo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.criticalRankedProducts.map((p, i) => (
                      <tr key={i} style={{ borderLeft: '4px solid #ef4444' }}>
                        <td><span className="badge badge-success" style={{ fontWeight: 900 }}>{p.ranking}</span></td>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td style={{ textAlign: 'center', fontSize: '18px', fontWeight: 800, color: '#ef4444' }}>{p.stock}</td>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{p.min_stock ?? 5}</td>
                        <td>
                          {p.stock === 0
                            ? <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '12px' }}>⛔ AGOTADO</span>
                            : <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '12px' }}>⚠️ Bajo mínimo</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Global Settings & Backup */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <h2 className="card-title">💾 Sistema y Respaldo</h2>
          <div className="last-sync-tag">
            Última sync: <strong>{formatTime(lastSync)}</strong>
          </div>
        </div>
        <div style={{ padding: '20px', display: 'flex', gap: '12px' }}>
           <button className="btn btn-primary" onClick={handleBackup} disabled={backing}>
             {backing ? <div className="spinner" style={{width: 14, height: 14}}></div> : '💾 Ejecutar Respaldo a GitHub'}
           </button>
           <button className="btn btn-secondary" onClick={() => window.location.reload()}>🔄 Recargar Panel</button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .dashboard-container { animation: fadeIn 0.5s ease; }
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; flex-wrap: wrap; gap: 16px; }
        .header-actions { display: flex; align-items: center; gap: 20px; }
        .time-selector { background: var(--bg-glass); border-radius: 12px; border: 1px solid var(--border-color); padding: 4px; display: flex; gap: 4px; }
        .time-btn { background: none; border: none; padding: 6px 16px; border-radius: 8px; color: var(--text-muted); font-size: 13px; font-weight: 700; cursor: pointer; transition: 0.2s; }
        .time-btn.active { background: var(--primary-color); color: white; box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.3); }
        .last-sync-tag { font-size: 11px; color: var(--text-muted); background: var(--bg-glass); padding: 4px 12px; border-radius: 20px; border: 1px solid var(--border-color); text-transform: uppercase; letter-spacing: 0.5px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 32px; }
        .charts-main-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 24px; }
        .chart-card.wide { grid-column: span 2; }
        .splits-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 24px; }
        .chart-container { padding: 16px; min-height: 300px; display: flex; align-items: center; justify-content: center; }
        .empty-chart { color: var(--text-muted); font-style: italic; }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
        .status-dot.red { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
        .status-dot.orange { background: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
        .oos-badge { padding: 4px 8px; border-radius: 20px; font-size: 11px; font-weight: 800; background: rgba(var(--primary-rgb), 0.1); color: var(--primary-color); }
        .oos-badge.critical { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        @media (max-width: 1024px) {
          .charts-main-grid { grid-template-columns: 1fr; }
          .chart-card.wide { grid-column: span 1; }
          .splits-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 600px) {
          .page-header { flex-direction: column; align-items: flex-start; }
          .header-actions { flex-direction: column; align-items: flex-start; width: 100%; }
          .time-selector { width: 100%; justify-content: space-between; }
          .time-btn { flex: 1; }
        }
      `}} />
    </div>
  );
}
