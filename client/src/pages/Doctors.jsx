import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Doctors({ addToast }) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({ name: '', specialty: '', phone: '', email: '', license: '', address: '', notes: '' });

  const load = () => {
    setLoading(true);
    api.getDoctors().then(setDoctors).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ name: '', specialty: '', phone: '', email: '', license: '', address: '', notes: '' });
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setShowModal(true); };

  const openEdit = (doc) => {
    setForm({ 
      name: doc.name, 
      specialty: doc.specialty || '', 
      phone: doc.phone || '', 
      email: doc.email || '', 
      license: doc.license || '',
      address: doc.address || '', 
      notes: doc.notes || '' 
    });
    setEditing(doc.id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.updateDoctor(editing, form);
        addToast('Doctor actualizado correctamente');
      } else {
        await api.createDoctor(form);
        addToast('Doctor creado correctamente');
      }
      setShowModal(false);
      resetForm();
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`¿Eliminar al doctor ${name}?`)) return;
    try {
      await api.deleteDoctor(id);
      addToast('Doctor eliminado');
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      addToast('Solo se permiten archivos de Excel (.xlsx, .xls)', 'error');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.uploadDoctorsExcel(formData);
      addToast(res.message);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };
  
  const filteredDoctors = doctors.filter(doc => 
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Doctores</h1>
        <p className="page-subtitle">Gestión de médicos registrados en el sistema</p>
      </div>

      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <h2 className="card-title" style={{ flex: '1 1 auto' }}>👨‍⚕️ Lista de Doctores ({filteredDoctors.length})</h2>
          
          <div className="search-bar" style={{ flex: '1 1 300px', display: 'flex', position: 'relative' }}>
             <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
             <input 
               type="text" 
               className="form-input" 
               placeholder="Buscar doctor por nombre..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               style={{ paddingLeft: '35px', margin: 0, width: '100%' }}
             />
          </div>

          <div className="btn-group">
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              style={{ display: 'none' }} 
              id="excel-upload-docs" 
              onChange={handleExcelUpload} 
            />
            <label htmlFor="excel-upload-docs" className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
              📊 Cargar Excel
            </label>
            <button className="btn btn-primary" onClick={openCreate}>+ Nuevo Doctor</button>
          </div>
        </div>

        {loading ? (
          <div className="loading-container"><div className="spinner"></div><span>Cargando...</span></div>
        ) : doctors.length > 0 ? (

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Especialidad</th>
                  <th>Teléfono</th>
                  <th>Cédula Profesional</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredDoctors.map(doc => (
                  <tr key={doc.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{doc.name}</td>
                    <td>{doc.specialty || '—'}</td>
                    <td>{doc.phone || '—'}</td>
                    <td>{doc.license || '—'}</td>
                    <td>
                      <div className="btn-group">
                        {doc.phone && (
                          <button 
                            className="btn btn-sm" 
                            style={{ background: '#25D366', color: 'white', border: 'none', padding: '5px 10px' }}
                            title="Contactar por WhatsApp"
                            onClick={() => {
                              const cleanPhone = doc.phone.replace(/\D/g, '');
                              const finalPhone = cleanPhone.length === 10 ? '52' + cleanPhone : cleanPhone;
                              const message = encodeURIComponent(`Hola Dr. ${doc.name}, le saludo de VisitaDoctores. Quedo a sus órdenes para darle seguimiento a su clínica.`);
                              window.open(`https://api.whatsapp.com/send?phone=${finalPhone}&text=${message}`, '_blank');
                            }}
                          >
                            💬
                          </button>
                        )}
                        <Link to={`/doctors/${doc.id}`} className="btn btn-primary btn-sm" style={{textDecoration: 'none'}}>Ver Perfil</Link>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(doc)}>✏️</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(doc.id, doc.name)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : doctors.length > 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <p className="empty-state-text">No se encontraron doctores que coincidan con "{searchTerm}"</p>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">👨‍⚕️</div>
            <p className="empty-state-text">No hay doctores registrados</p>
            <p className="empty-state-hint">Haz clic en "Nuevo Doctor" o sube un archivo Excel</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{editing ? '✏️ Editar Doctor' : '➕ Nuevo Doctor'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="DR NOMBRE APELLIDO" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Especialidad</label>
                  <input className="form-input" value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} placeholder="Cardiología" />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="81 1234 5678" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Cédula Profesional</label>
                <input className="form-input" value={form.license} onChange={e => setForm({ ...form, license: e.target.value })} placeholder="12345678" />
              </div>
              <div className="form-group">
                <label className="form-label">Email (Opcional)</label>
                <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="doctor@correo.com" />
              </div>
              <div className="form-group">
                <label className="form-label">Dirección</label>
                <input className="form-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Consultorio / Clínica" />
              </div>
              <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notas adicionales..."></textarea>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Guardar Cambios' : 'Crear Doctor'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
