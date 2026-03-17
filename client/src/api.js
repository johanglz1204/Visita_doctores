const API_BASE = '/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

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
  // Dashboard
  getDashboard: () => request('/dashboard'),

  // Doctors
  getDoctors: () => request('/doctors'),
  getDoctor: (id) => request(`/doctors/${id}`),
  createDoctor: (data) => request('/doctors', { method: 'POST', body: data }),
  updateDoctor: (id, data) => request(`/doctors/${id}`, { method: 'PUT', body: data }),
  deleteDoctor: (id) => request(`/doctors/${id}`, { method: 'DELETE' }),
  uploadDoctorsExcel: (formData) => request('/doctors/upload-excel', { method: 'POST', body: formData }),

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
  getSales: (limit, offset) => request(`/sales?limit=${limit || 100}&offset=${offset || 0}`),
  uploadFile: (formData) => request('/sales/upload', { method: 'POST', body: formData }),
  parsePreview: (formData) => request('/sales/parse-preview', { method: 'POST', body: formData }),

  // Sync
  syncEmails: () => request('/sync/emails', { method: 'POST' }),
};



