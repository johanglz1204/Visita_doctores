import { useState, useEffect } from 'react';
import { ThemeProvider, useTheme } from './ThemeContext';
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import { api } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Doctors from './pages/Doctors';
import DoctorProfile from './pages/DoctorProfile';
import Products from './pages/Products';
import Upload from './pages/Upload';
import Alerts from './pages/Alerts';
import Sales from './pages/Sales';
import InventoryPlanning from './pages/InventoryPlanning';
import ErrorBoundary from './components/ErrorBoundary';

function Sidebar({ onLogout }) {
  const { theme, toggleTheme } = useTheme();
  const [criticalCount, setCriticalCount] = useState(0);
  const location = useLocation();

  useEffect(() => {
    api.getCriticalStock().then(data => setCriticalCount(data.length)).catch(() => {});
    const interval = setInterval(() => {
      api.getCriticalStock().then(data => setCriticalCount(data.length)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const links = [
    { to: '/', icon: '📊', label: 'Dashboard' },
    { to: '/doctors', icon: '👨‍⚕️', label: 'Doctores' },
    { to: '/products', icon: '💊', label: 'Productos' },
    { to: '/sales', icon: '🧾', label: 'Historial' },
    { to: '/planning', icon: '🧠', label: 'Planeación' },
    { to: '/alerts', icon: '🚨', label: 'Alertas', badge: criticalCount },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🏥</div>
          <div>
            <div className="sidebar-logo-text">VisitaDoctores</div>
            <div className="sidebar-logo-sub">Gestión Médica</div>
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
        <button
          className="nav-link"
          onClick={onLogout}
          style={{
            justifyContent: 'flex-start',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444'
          }}
        >
          <span className="nav-icon">🚪</span>
          <span>Cerrar Sesión</span>
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = api.onAuthStateChanged((user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
      toast.success('Sesión cerrada');
    } catch (error) {
      toast.error('Error al cerrar sesión');
    }
  };


  const addToast = (message, type = 'success') => {
    if (type === 'error') {
      toast.error(message);
    } else {
      toast.success(message);
    }
  };

  if (loading) {
    return <div className="loading-screen">Cargando...</div>;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        {!user ? (
          <Login />
        ) : (
          <BrowserRouter>
            <div className="app-layout">
              <Sidebar onLogout={handleLogout} />
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<Dashboard addToast={addToast} />} />
                  <Route path="/doctors" element={<Doctors addToast={addToast} />} />
                  <Route path="/doctors/:id" element={<DoctorProfile addToast={addToast} />} />
                  <Route path="/products" element={<Products addToast={addToast} />} />
                  <Route path="/sales" element={<Sales />} />
                  <Route path="/planning" element={<InventoryPlanning />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </BrowserRouter>
        )}
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
