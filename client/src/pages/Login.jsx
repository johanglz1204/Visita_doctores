import { useState } from 'react';
import { api } from '../api';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.login(email, password);
      toast.success('Bienvenido');
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      toast.error('Error al iniciar sesión: ' + (err.message || 'Credenciales inválidas'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100%', background: 'var(--bg-app)' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: '120px', height: '120px', margin: '0 auto 1.5rem' }}>
            <img src="/logo.png" alt="SICOIN Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>SICOIN</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Sistema para el Control de Inventarios</p>
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Usuario</label>
            <input
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input"
              required
              autoFocus
              placeholder="admin"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input"
              required
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}
