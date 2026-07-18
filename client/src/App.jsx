import { useState, useEffect } from 'react';
import { ThemeProvider, useTheme } from './ThemeContext';
import { HashRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import Doctors from './pages/Doctors';
import DoctorProfile from './pages/DoctorProfile';
import Products from './pages/Products';
import Upload from './pages/Upload';
import Alerts from './pages/Alerts';
import Sales from './pages/Sales';
import InventoryPlanning from './pages/InventoryPlanning';
import ProductMapping from './pages/ProductMapping';
import SyncCenter from './pages/SyncCenter';
import ErrorBoundary from './components/ErrorBoundary';

function Sidebar() {
  const { theme, toggleTheme } = useTheme();
  const [criticalCount, setCriticalCount] = useState(0); // Keeping state for now to avoid breaking other components if they depend on it, but effectively hidden
  const location = useLocation();

  useEffect(() => {
    // Logic for other background tasks can go here if needed
  }, []);

  const links = [
    { to: '/', icon: '📊', label: 'Dashboard' },
    { to: '/doctors', icon: '👨‍⚕️', label: 'Doctores' },
    { to: '/products', icon: '💊', label: 'Productos' },
    { to: '/sales', icon: '🧾', label: 'Historial' },
    { to: '/planning', icon: '🧠', label: 'Planeación' },
    { to: '/sync', icon: '🔄', label: 'Sincronización' },
    { to: '/mapping', icon: '🔗', label: 'Mapeo' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <img src="/logo.png" alt="SICOIN Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <div className="sidebar-logo-text">SICOIN</div>
            <div className="sidebar-logo-sub">Control de Inventarios</div>
          </div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {links.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{link.icon}</span>
            <span>{link.label}</span>
            {link.badge > 0 && <span className="nav-badge">{link.badge}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer" style={{ padding: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button 
          className="nav-link" 
          onClick={toggleTheme}
          style={{ 
            justifyContent: 'flex-start',
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-color)'
          }}
        >
          <span className="nav-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}</span>
        </button>
      </div>
    </aside>
  );
}

function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          onClick={() => onDismiss(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const addToast = (message, type = 'success') => {
    if (type === 'error') {
      toast.error(message);
    } else {
      toast.success(message);
    }
  };

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <HashRouter>
          <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <Routes>
                  <Route path="/" element={<Dashboard addToast={addToast} />} />
                  <Route path="/doctors" element={<Doctors addToast={addToast} />} />
                  <Route path="/doctors/:id" element={<DoctorProfile addToast={addToast} />} />
                  <Route path="/products" element={<Products addToast={addToast} />} />
                  <Route path="/sales" element={<Sales />} />
                  <Route path="/planning" element={<InventoryPlanning />} />
                  <Route path="/sync" element={<SyncCenter />} />
                  <Route path="/mapping" element={<ProductMapping />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
        </HashRouter>
        <Toaster 
          position="top-right" 
          toastOptions={{ 
            style: { 
              background: 'var(--bg-card)', 
              color: 'var(--text-primary)', 
              border: '1px solid var(--border-color)',
              backdropFilter: 'blur(10px)'
            } 
          }} 
        />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
