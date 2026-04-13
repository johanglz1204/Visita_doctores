import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary atrapó un error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px', margin: '2rem', border: '1px solid var(--danger-color)' }}>
          <h2 style={{ color: 'var(--danger-color)', marginBottom: '1rem' }}>⚠️ Ocurrió un error inesperado de Interfaz</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
            {this.state.error && this.state.error.toString()}
          </p>
          <button 
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Recargar Página
          </button>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
