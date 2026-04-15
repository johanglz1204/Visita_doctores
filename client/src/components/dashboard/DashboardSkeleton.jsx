import StatCard from './StatCard';

export default function DashboardSkeleton() {
  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <div className="skeleton skeleton-title" style={{ width: '200px' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '300px' }}></div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div className="skeleton" style={{ width: '120px', height: '40px', borderRadius: '10px' }}></div>
          <div className="skeleton" style={{ width: '120px', height: '40px', borderRadius: '10px' }}></div>
        </div>
      </div>

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <StatCard loading={true} />
        <StatCard loading={true} />
        <StatCard loading={true} />
        <StatCard loading={true} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        <div className="card">
          <div className="skeleton skeleton-title" style={{ width: '40%' }}></div>
          <div className="skeleton-card" style={{ height: '300px', marginTop: '20px' }}></div>
        </div>
        <div className="card">
          <div className="skeleton skeleton-title" style={{ width: '40%' }}></div>
          <div className="skeleton-card" style={{ height: '300px', marginTop: '20px' }}></div>
        </div>
      </div>

      <div className="card">
        <div className="skeleton skeleton-title" style={{ width: '30%' }}></div>
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton skeleton-text" style={{ height: '40px' }}></div>
          ))}
        </div>
      </div>
    </div>
  );
}
