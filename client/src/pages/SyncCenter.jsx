import { useState, useEffect } from 'react';
import { api } from '../api';
import toast from 'react-hot-toast';

export default function SyncCenter() {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState({ sync_interval_minutes: '60' });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sincronización de VENTAS por doctor (independiente de la de existencias)
  const [salesDays, setSalesDays] = useState('60');
  const [salesSyncing, setSalesSyncing] = useState(false);
  const [salesLog, setSalesLog] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusRes, settingsRes, salesRes] = await Promise.all([
        api.syncStatus(),
        api.getSettings(),
        api.salesSyncStatus()
      ]);
      setStatus(statusRes);
      setSettings(settingsRes);
      setSalesLog(salesRes?.history?.[0] || null);
    } catch (err) {
      toast.error('Error al cargar datos de sincronización');
    } finally {
      setLoading(false);
    }
  };

  const handleSalesSync = async () => {
    setSalesSyncing(true);
    const toastId = toast.loading(`Recuperando ventas de los últimos ${salesDays} días...`);
    try {
      const res = await api.triggerSalesSync(salesDays);
      toast.success(
        `Ventas sincronizadas: ${res.new_records ?? 0} nuevas, ${res.skipped_duplicates ?? 0} ya existían.`,
        { id: toastId }
      );
      loadData();
    } catch (err) {
      toast.error(err.message, { id: toastId });
    } finally {
      setSalesSyncing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await api.triggerSync();
      toast.success(res.message);
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await api.updateSettings(settings);
      toast.success('Configuración guardada. El intervalo de sincronización se ha actualizado.');
    } catch (err) {
      toast.error('Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-container"><div className="spinner"></div></div>;

  const lastSync = status?.last_sync;

  return (
    <div className="sync-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sincronización de Inventario</h1>
          <p className="page-subtitle">Gestión de enlace con el Servidor Central de Inventarios</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={handleManualSync} 
          disabled={syncing || status?.sync_in_progress}
        >
          {syncing || status?.sync_in_progress ? (
            <><div className="spinner" style={{width: 14, height: 14, marginRight: 8}}></div> Sincronizando...</>
          ) : '🔄 Sincronizar Ahora'}
        </button>
      </div>

      <div className="sync-grid">
        {/* Panel de Estado Actual */}
        <div className="card status-card">
          <div className="card-header">
            <h2 className="card-title">Estado del Sistema</h2>
            <div className={`status-badge ${status?.sync_in_progress ? 'active' : 'idle'}`}>
              {status?.sync_in_progress ? 'TRABAJANDO' : 'EN ESPERA'}
            </div>
          </div>
          <div className="status-content">
            {lastSync ? (
              <div className="last-sync-details">
                <div className="detail-item">
                  <span className="label">Última Sincronización</span>
                  <span className="value">{new Date(lastSync.synced_at).toLocaleString()}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Duración</span>
                  <span className="value">{(lastSync.duration_ms / 1000).toFixed(2)}s</span>
                </div>
                <div className="stats-mini-grid">
                  <div className="mini-stat matched">
                    <span className="num">{lastSync.matched}</span>
                    <span className="lab">Vinculados</span>
                  </div>
                  <div className="mini-stat updated">
                    <span className="num">{lastSync.updated}</span>
                    <span className="lab">Actualizados</span>
                  </div>
                  <div className="mini-stat unmatched">
                    <span className="num">{lastSync.unmatched}</span>
                    <span className="lab">Sin Match</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="empty-hint">No hay registros de sincronización previa.</p>
            )}
          </div>
        </div>

        {/* Panel de Configuración Automática */}
        <div className="card config-card">
          <div className="card-header">
            <h2 className="card-title">Programación Automática</h2>
          </div>
          <div className="config-content">
            <div className="form-group">
              <label className="form-label">Intervalo de Sincronización (minutos)</label>
              <select 
                className="form-input" 
                value={settings.sync_interval_minutes || '60'}
                onChange={(e) => setSettings({ ...settings, sync_interval_minutes: e.target.value })}
              >
                <option value="5">Cada 5 minutos (Rápido)</option>
                <option value="15">Cada 15 minutos</option>
                <option value="30">Cada 30 minutos</option>
                <option value="60">Cada 60 minutos (Recomendado)</option>
                <option value="120">Cada 2 horas</option>
                <option value="360">Cada 6 horas</option>
                <option value="720">Cada 12 horas</option>
                <option value="1440">Una vez al día</option>
              </select>
              <p className="input-hint">El sistema se sincronizará automáticamente con MySQL en el fondo usando este intervalo.</p>
            </div>
            <button 
              className="btn btn-secondary" 
              style={{ width: '100%', marginTop: '12px' }}
              onClick={handleSaveSettings}
              disabled={saving}
            >
              {saving ? 'Guardando...' : '💾 Guardar Configuración'}
            </button>
          </div>
        </div>
      </div>

      {/* Sincronización de Ventas por Doctor */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <h2 className="card-title">🧾 Ventas por Doctor</h2>
          {salesLog && (
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Última: {new Date(salesLog.synced_at).toLocaleString()} — {salesLog.new_records} nuevas
            </span>
          )}
        </div>
        <div style={{ padding: '16px' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Las ventas se sincronizan solas cada hora, pero solo mirando <strong>60 días hacia atrás</strong>.
            Si necesitas recuperar meses anteriores (por ejemplo, para comparar contra SICOFA), amplía el
            rango aquí. Las ventas ya registradas se detectan por folio y no se duplican.
          </p>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ margin: 0, flex: '0 0 auto' }}>
              <label className="form-label">Rango a recuperar</label>
              <select
                className="form-input"
                style={{ width: 'auto', minWidth: '220px' }}
                value={salesDays}
                onChange={(e) => setSalesDays(e.target.value)}
                disabled={salesSyncing}
              >
                <option value="60">Últimos 60 días (rutina)</option>
                <option value="90">Últimos 3 meses</option>
                <option value="180">Últimos 6 meses</option>
                <option value="365">Último año</option>
                <option value="730">Últimos 2 años (completo)</option>
              </select>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleSalesSync}
              disabled={salesSyncing}
            >
              {salesSyncing ? (
                <><div className="spinner" style={{ width: 14, height: 14, marginRight: 8 }}></div> Recuperando...</>
              ) : '🧾 Recuperar Ventas'}
            </button>
          </div>
          <p className="input-hint" style={{ marginTop: '12px' }}>
            ⚠️ Con rangos amplios la consulta a SICOFA puede tardar varios minutos. Conviene correrla
            fuera del horario de mayor movimiento.
          </p>
        </div>
      </div>

      {/* Historial de Sincronizaciones */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <h2 className="card-title">Historial Reciente</h2>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Fecha/Hora</th>
                <th>Total MySQL</th>
                <th>Match</th>
                <th>Actualizados</th>
                <th>Sin Match</th>
                <th>Errores</th>
                <th>Duración</th>
              </tr>
            </thead>
            <tbody>
              {status?.history?.map(h => (
                <tr key={h.id}>
                  <td style={{ fontWeight: 600 }}>{new Date(h.synced_at).toLocaleString()}</td>
                  <td>{h.total_mysql}</td>
                  <td style={{ color: '#10b981', fontWeight: 700 }}>{h.matched}</td>
                  <td style={{ color: '#4f46e5', fontWeight: 700 }}>{h.updated}</td>
                  <td style={{ color: h.unmatched > 0 ? '#f59e0b' : 'inherit', fontWeight: h.unmatched > 0 ? 800 : 400 }}>{h.unmatched}</td>
                  <td style={{ color: h.errors > 0 ? '#ef4444' : 'inherit' }}>{h.errors}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{(h.duration_ms / 1000).toFixed(2)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .sync-container { animation: fadeIn 0.5s ease; }
        .sync-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 24px; }
        .status-badge { font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 20px; }
        .status-badge.idle { background: rgba(var(--text-muted-rgb), 0.1); color: var(--text-muted); }
        .status-badge.active { background: #10b981; color: white; box-shadow: 0 0 10px rgba(16, 185, 129, 0.4); animation: pulse 2s infinite; }
        
        .last-sync-details { display: flex; flex-direction: column; gap: 16px; }
        .detail-item { display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
        .detail-item .label { color: var(--text-muted); font-size: 13px; }
        .detail-item .value { font-weight: 700; font-size: 13px; }
        
        .stats-mini-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 8px; }
        .mini-stat { padding: 12px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        .mini-stat.matched { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .mini-stat.updated { background: rgba(79, 70, 229, 0.1); color: #4f46e5; }
        .mini-stat.unmatched { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .mini-stat .num { font-size: 20px; font-weight: 900; }
        .mini-stat .lab { font-size: 10px; font-weight: 800; text-transform: uppercase; }
        
        .input-hint { font-size: 11px; color: var(--text-muted); margin-top: 8px; font-style: italic; }
        
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.6; } 100% { opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        @media (max-width: 1024px) {
          .sync-grid { grid-template-columns: 1fr; }
        }
      `}} />
    </div>
  );
}
