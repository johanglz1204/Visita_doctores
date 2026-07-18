export default function StatCard({ title, value, icon, colorClass, loading, trend }) {
  if (loading) {
    return (
      <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="skeleton skeleton-avatar" style={{ width: '32px', height: '32px' }}></div>
        <div className="skeleton skeleton-title" style={{ width: '80%', height: '24px' }}></div>
        <div className="skeleton skeleton-text" style={{ width: '40%' }}></div>
      </div>
    );
  }

  return (
    <div className={`stat-card ${colorClass}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">
        {value}
        {trend !== undefined && (
          <span className={`stat-trend ${trend >= 0 ? 'up' : 'down'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="stat-label">{title}</div>
      <style dangerouslySetInnerHTML={{ __html: `
        .stat-card {
          display: flex;
          flex-direction: column;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
        }
        .stat-card.purple::before { background: linear-gradient(90deg, #4f46e5, #818cf8); }
        .stat-card.cyan::before { background: linear-gradient(90deg, #06b6d4, #3b82f6); }
        .stat-card.green::before { background: linear-gradient(90deg, #10b981, #34d399); }
        .stat-card.red::before { background: linear-gradient(90deg, #ef4444, #f87171); }
        
        .stat-icon { font-size: 32px; margin-bottom: 8px; }
        .stat-value { 
          font-size: 32px; 
          font-weight: 800; 
          color: var(--text-primary); 
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .stat-label { font-size: 13px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }

        .stat-trend {
          font-size: 14px;
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 700;
        }
        .stat-trend.up { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .stat-trend.down { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
      `}} />
    </div>
  );
}
