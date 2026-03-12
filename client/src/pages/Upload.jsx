import { useState, useRef } from 'react';
import { api } from '../api';

export default function Upload({ addToast }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    if (!selectedFile.name.endsWith('.txt')) {
      addToast('Solo se permiten archivos .txt', 'error');
      return;
    }
    setFile(selectedFile);
    setResult(null);

    // Auto-preview
    const formData = new FormData();
    formData.append('file', selectedFile);
    api.parsePreview(formData)
      .then(setPreview)
      .catch(err => addToast(err.message, 'error'));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFileSelect(droppedFile);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.uploadFile(formData);
      setResult(res);
      setFile(null);
      setPreview(null);
      addToast(res.message);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Cargar Archivo TXT</h1>
        <p className="page-subtitle">Sube un ticket de venta para parsear automáticamente doctor, producto, cantidad y fecha</p>
      </div>

      {/* Upload zone */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div
          className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="upload-zone-icon">📄</div>
          <div className="upload-zone-text">
            {file ? `📎 ${file.name}` : 'Arrastra tu archivo .txt aquí o haz clic para seleccionar'}
          </div>
          <div className="upload-zone-hint">Formatos soportados: .txt (tickets de Farmapram y similares)</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            style={{ display: 'none' }}
            onChange={e => handleFileSelect(e.target.files[0])}
          />
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h2 className="card-title">👁️ Vista Previa ({preview.recordsFound} registros detectados)</h2>
            <button
              className="btn btn-success"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? <><div className="spinner" style={{ width: 16, height: 16 }}></div> Procesando...</> : '✅ Confirmar y Guardar'}
            </button>
          </div>
          {preview.records.map((record, idx) => (
            <div key={idx} className="parse-result">
              <div className="parse-field">
                <span className="parse-field-label">👨‍⚕️ Doctor</span>
                <span className="parse-field-value">{record.doctor || '— No detectado'}</span>
              </div>
              <div className="parse-field">
                <span className="parse-field-label">💊 Producto</span>
                <span className="parse-field-value">{record.product || '— No detectado'} {record.presentation || ''}</span>
              </div>
              <div className="parse-field">
                <span className="parse-field-label">📦 Cantidad</span>
                <span className="parse-field-value">{record.quantity} Pza</span>
              </div>
              <div className="parse-field">
                <span className="parse-field-label">📅 Fecha</span>
                <span className="parse-field-value">{record.date}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">✅ Resultado del Procesamiento</h2>
          </div>
          <div style={{ padding: '12px 0' }}>
            <p style={{ color: 'var(--accent-success)', fontWeight: 600, marginBottom: 16 }}>
              {result.message}
            </p>
            {result.records.map((rec, idx) => (
              <div key={idx} className="parse-result">
                <div className="parse-field">
                  <span className="parse-field-label">Doctor</span>
                  <span className="parse-field-value">{rec.parsed.doctor || '—'}</span>
                </div>
                <div className="parse-field">
                  <span className="parse-field-label">Producto</span>
                  <span className="parse-field-value">{rec.parsed.product || '—'} {rec.parsed.presentation || ''}</span>
                </div>
                <div className="parse-field">
                  <span className="parse-field-label">Cantidad</span>
                  <span className="parse-field-value">{rec.parsed.quantity} Pza</span>
                </div>
                <div className="parse-field">
                  <span className="parse-field-label">Registrado</span>
                  <span className="badge badge-success">✅ Guardado en BD</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
