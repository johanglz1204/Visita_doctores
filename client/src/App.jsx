import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { api } from './api';
import Dashboard from './pages/Dashboard';
import Doctors from './pages/Doctors';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Upload from './pages/Upload';
import Alerts from './pages/Alerts';
import Sales from './pages/Sales';

function Sidebar() {
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
    { to: '/inventory', icon: '📦', label: 'Inventario' },
    { to: '/upload', icon: '📄', label: 'Cargar TXT' },
    { to: '/sales', icon: '🧾', label: 'Historial' },
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
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const dismissToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard addToast={addToast} />} />
            <Route path="/doctors" element={<Doctors addToast={addToast} />} />
            <Route path="/products" element={<Products addToast={addToast} />} />
            <Route path="/inventory" element={<Inventory addToast={addToast} />} />
            <Route path="/upload" element={<Upload addToast={addToast} />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/alerts" element={<Alerts />} />
          </Routes>
        </main>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </BrowserRouter>
  );
}
