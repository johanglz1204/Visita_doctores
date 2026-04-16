const API_BASE = '/api';

// Helper to refresh the token
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('No refresh token available');

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  if (!res.ok) {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    throw new Error('Refresh token invalid');
  }

  const data = await res.json();
  localStorage.setItem('accessToken', data.accessToken);
  return data.accessToken;
}

async function request(path, options = {}, isRetry = false) {
  const url = `${API_BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  if (config.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  try {
    const res = await fetch(url, config);
    
    // Si el token ha expirado (403) o es inválido (401), intentamos refrescar
    if ((res.status === 401 || res.status === 403) && !isRetry && localStorage.getItem('refreshToken')) {
      console.log('Access token expired. Attempting refresh...');
      try {
        const newToken = await refreshAccessToken();
        // Reintentar la petición original con el nuevo token
        return request(path, options, true);
      } catch (refreshErr) {
        console.error('Refresh failed. Redirecting to login.');
        window.location.reload(); // Forzar logout
        return;
      }
    }

    return res.json();
  } catch (error) {
    console.error(`Error en API Request (${path}):`, error);
    throw error;
  }
}

async function downloadFile(path, filename) {
  const token = localStorage.getItem('accessToken');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Error al descargar archivo' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download.xlsx';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}


export const api = {
  // Auth
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),

  // Dashboard
  getDashboard: () => request('/dashboard'),

  // Doctors
  getDoctors: () => request('/doctors'),
  getDoctor: (id) => request(`/doctors/${id}`),
  getDoctorStats: (id) => request(`/doctors/${id}/stats`),
  createDoctor: (data) => request('/doctors', { method: 'POST', body: data }),
  updateDoctor: (id, data) => request(`/doctors/${id}`, { method: 'PUT', body: data }),
  deleteDoctor: (id) => request(`/doctors/${id}`, { method: 'DELETE' }),
  uploadDoctorsExcel: (formData) => request('/doctors/upload-excel', { method: 'POST', body: formData }),
  exportProductsExcel: () => downloadFile('/products/export-excel', 'Productos.xlsx'),

  // Products
  getProducts: () => request('/products'),
  getProduct: (id) => request(`/products/${id}`),
  createProduct: (data) => request('/products', { method: 'POST', body: data }),
  updateProduct: (id, data) => request(`/products/${id}`, { method: 'PUT', body: data }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  uploadProductsExcel: (formData) => request('/products/upload-excel', { method: 'POST', body: formData }),
  getDuplicatesPreview: () => request('/mysql-sync/duplicates-preview'),
  cleanupProducts: () => request('/mysql-sync/cleanup-duplicates', { method: 'POST' }),
  syncStatus: () => request('/mysql-sync/status'),
  triggerSync: () => request('/mysql-sync/trigger', { method: 'POST' }),
  triggerRankingSync: () => request('/mysql-sync/rankings', { method: 'POST' }),



  // Inventory
  getInventory: () => request('/inventory'),
  getCriticalStock: (threshold) => request(`/inventory/critical?threshold=${threshold || 2}`),
  getLastSyncLog: () => request('/sync/last-log'),
  createInventory: (data) => request('/inventory', { method: 'POST', body: data }),
  updateInventory: (id, data) => request(`/inventory/${id}`, { method: 'PUT', body: data }),
  deleteInventory: (id) => request(`/inventory/${id}`, { method: 'DELETE' }),
  uploadInventoryExcel: (formData) => request('/inventory/upload-excel', { method: 'POST', body: formData }),

  // Sales
  getSales: (limit, offset, sucursal, startDate, endDate) => {
    let url = `/sales?limit=${limit || 100}&offset=${offset || 0}`;
    if (sucursal) url += `&sucursal=${encodeURIComponent(sucursal)}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    return request(url);
  },
  uploadFile: (formData) => request('/sales/upload', { method: 'POST', body: formData }),
  parsePreview: (formData) => request('/sales/parse-preview', { method: 'POST', body: formData }),
  exportSalesExcel: (sucursal, startDate, endDate) => {
    let url = `/sales/export-excel`;
    const params = [];
    if (sucursal) params.push(`sucursal=${encodeURIComponent(sucursal)}`);
    if (startDate) params.push(`startDate=${startDate}`);
    if (endDate) params.push(`endDate=${endDate}`);
    
    if (params.length > 0) {
       url += `?${params.join('&')}`;
    }
    return downloadFile(url, 'Reporte_Ventas.xlsx');
  },

  // Sync
  syncEmails: () => request('/sync/emails', { method: 'POST' }),

  // Branches
  getBranches: () => request('/sales/branches'),

  // Backup
  backupToGithub: () => request('/backup/github', { method: 'POST' }),
  downloadBackup: () => `${API_BASE}/backup/download`,
};



