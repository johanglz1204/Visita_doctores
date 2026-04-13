const API_BASE = '/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  if (config.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  const res = await fetch(url, config);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Error de red' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.json();
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
  exportProductsExcel: () => `${API_BASE}/products/export-excel`,

  // Products
  getProducts: () => request('/products'),
  getProduct: (id) => request(`/products/${id}`),
  createProduct: (data) => request('/products', { method: 'POST', body: data }),
  updateProduct: (id, data) => request(`/products/${id}`, { method: 'PUT', body: data }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  uploadProductsExcel: (formData) => request('/products/upload-excel', { method: 'POST', body: formData }),


  // Inventory
  getInventory: () => request('/inventory'),
  getCriticalStock: (threshold) => request(`/inventory/critical?threshold=${threshold || 2}`),
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
    let url = `${API_BASE}/sales/export-excel`;
    const params = [];
    if (sucursal) params.push(`sucursal=${encodeURIComponent(sucursal)}`);
    if (startDate) params.push(`startDate=${startDate}`);
    if (endDate) params.push(`endDate=${endDate}`);
    
    if (params.length > 0) {
       url += `?${params.join('&')}`;
    }
    return url;
  },

  // Sync
  syncEmails: () => request('/sync/emails', { method: 'POST' }),

  // Branches
  getBranches: () => request('/sales/branches'),

  // Backup
  backupToGithub: () => request('/backup/github', { method: 'POST' }),
  downloadBackup: () => `${API_BASE}/backup/download`,
};



