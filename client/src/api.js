// Configuración de API (v2.0.0 - con auto-refresh de token)
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

// =====================================================================
// Token refresh logic
// =====================================================================
let _isRefreshing = false;
let _refreshQueue = [];

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('No hay refresh token disponible');

  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  if (!res.ok) {
    throw new Error('Refresh token inválido o expirado');
  }

  const data = await res.json();
  localStorage.setItem('accessToken', data.accessToken);
  return data.accessToken;
}

// =====================================================================
// Core request helper (with auto-refresh on 401/403)
// =====================================================================
async function request(collectionName, operation = 'get', idOrData = null, extra = null) {
  return _doRequest(collectionName, operation, idOrData, extra, false);
}

async function _doRequest(collectionName, operation, idOrData, extra, isRetry) {
  const token = localStorage.getItem('accessToken');
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  let url = `${API_BASE}/api/${collectionName}`;
  let method = 'GET';
  let body = null;

  if (operation === 'get') {
    if (idOrData && typeof idOrData === 'string') {
      url += `/${idOrData}`;
    }
    if (extra && extra.params) {
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(extra.params)) {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, value);
        }
      }
      const qs = queryParams.toString();
      if (qs) url += `?${qs}`;
    }
  } else if (operation === 'add') {
    method = 'POST';
    body = JSON.stringify(idOrData);
  } else if (operation === 'update') {
    method = 'PUT';
    url += `/${idOrData}`;
    body = JSON.stringify(extra);
  } else if (operation === 'delete') {
    method = 'DELETE';
    url += `/${idOrData}`;
  }

  try {
    const res = await fetch(url, { method, headers, body });

    // Handle session expiration — try to refresh token once
    if ((res.status === 401 || res.status === 403) && !isRetry) {
      if (_isRefreshing) {
        // Queue this request until refresh is done
        return new Promise((resolve, reject) => {
          _refreshQueue.push({ resolve, reject, collectionName, operation, idOrData, extra });
        });
      }

      _isRefreshing = true;
      try {
        await refreshAccessToken();
        // Flush queue
        const queue = [..._refreshQueue];
        _refreshQueue = [];
        queue.forEach(({ resolve, reject, collectionName, operation, idOrData, extra }) => {
          _doRequest(collectionName, operation, idOrData, extra, true).then(resolve).catch(reject);
        });
        // Retry original request
        return _doRequest(collectionName, operation, idOrData, extra, true);
      } catch (refreshError) {
        // Refresh failed — clear session and force re-login
        _refreshQueue.forEach(({ reject }) => reject(new Error('Sesión expirada')));
        _refreshQueue = [];
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.reload();
        throw new Error('Sesión expirada. Por favor inicia sesión de nuevo.');
      } finally {
        _isRefreshing = false;
      }
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: `Error HTTP ${res.status}` }));
      throw new Error(errorData.error || `Error HTTP ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    if (!(error.message && error.message.includes('Sesión'))) {
      console.error(`Error en API (${collectionName} - ${operation}):`, error.message);
    }
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
  // =====================================================================
  // Auth
  // =====================================================================
  login: async (username, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login fallido');
    }
    const data = await res.json();
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify({ username: data.username }));
    return data;
  },

  logout: async () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.location.reload();
  },

  onAuthStateChanged: (callback) => {
    const user = localStorage.getItem('user');
    callback(user ? JSON.parse(user) : null);
    return () => {};
  },

  // =====================================================================
  // Dashboard  — usa el controlador del servidor
  // =====================================================================
  getDashboard: async (days = 30, branchFilter = 'all') => {
    try {
      const stats = await request('dashboard', 'get', null, {
        params: { days, branch: branchFilter }
      });
      return stats;
    } catch (error) {
      // Si falla el dashboard, devolver estructura vacía en lugar de propagar el error
      console.error('Error cargando dashboard:', error.message);
      return {
        totalDoctors: 0,
        totalProducts: 0,
        totalInventory: 0,
        criticalAlerts: 0,
        recentSales: [],
        salesTrend: [],
        topDoctors: [],
        urgentDoctors: [],
        sucursalStats: [],
        lineStats: [],
        growth: 0,
        inventoryForecast: [],
        criticalRankedProducts: [],
        lastSyncTime: null,
        _error: error.message
      };
    }
  },

  // =====================================================================
  // Doctors
  // =====================================================================
  getDoctors: () => request('doctors'),
  getDoctor: (id) => request('doctors', 'get', String(id)),
  createDoctor: (data) => request('doctors', 'add', data),
  updateDoctor: (id, data) => request('doctors', 'update', String(id), data),
  deleteDoctor: (id) => request('doctors', 'delete', String(id)),
  getDoctorVisits: (id) => request(`doctors/${id}/visits`),
  createDoctorVisit: (id, data) => request(`doctors/${id}/visits`, 'add', data),
  deleteDoctorVisit: (doctorId, visitId) => request(`doctors/${doctorId}/visits`, 'delete', String(visitId)),
  // month: "YYYY-MM" para un mes concreto, "all" para el acumulado histórico.
  // Si se omite, el servidor responde con el mes en curso.
  getDoctorStats: (id, month) => request(`doctors/${id}/stats`, 'get', null, { params: { month } }),
  classifyDoctors: () => request('doctors/classify', 'add'),

  // =====================================================================
  // Products
  // =====================================================================
  getProducts: () => request('products'),
  getProduct: (id) => request('products', 'get', String(id)),
  createProduct: (data) => request('products', 'add', data),
  updateProduct: (id, data) => request('products', 'update', String(id), data),
  deleteProduct: (id) => request('products', 'delete', String(id)),

  // =====================================================================
  // Inventory
  // =====================================================================
  getInventory: (params) => request('inventory', 'get', null, { params }),
  createInventory: (data) => request('inventory', 'add', data),
  updateInventory: (id, data) => request('inventory', 'update', String(id), data),
  deleteInventory: (id) => request('inventory', 'delete', String(id)),

  // =====================================================================
  // Sales
  // =====================================================================
  getSales: async (limitVal = 50, offset = 0, sucursal, startDate, endDate, doctorId, productId) => {
    const salesRes = await request('sales', 'get', null, {
      params: { limit: limitVal, offset, sucursal, startDate, endDate, doctor_id: doctorId, product_id: productId }
    });
    // Server returns { data: [...], total: N }
    // But resolve doctor_name and product_name from inline join (server already does this)
    const data = salesRes.data || (Array.isArray(salesRes) ? salesRes : []);
    const total = salesRes.total || data.length;
    return { data, total };
  },

  // For Sales page export button
  exportSalesExcel: (sucursal, startDate, endDate) => {
    const token = localStorage.getItem('accessToken');
    const params = new URLSearchParams({ sucursal: sucursal || '', startDate: startDate || '', endDate: endDate || '' });
    const link = document.createElement('a');
    link.href = `${API_BASE}/api/sales/export-excel?${params}`;
    // Pass token via query for file download (simpler approach)
    link.download = 'Ventas.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  getBranches: async () => {
    try {
      // Use the dedicated branches endpoint to avoid fetching all sales
      const res = await request('sales/branches');
      return Array.isArray(res) ? res : [];
    } catch (e) {
      return [];
    }
  },

  // =====================================================================
  // Critical Stock
  // =====================================================================
  getCriticalStock: async () => {
    const products = await request('products');
    return (Array.isArray(products) ? products : []).filter(p => (p.stock || 0) <= (p.min_stock || 5));
  },

  // =====================================================================
  // Inventory Planning
  // =====================================================================
  getSuggestedOrders: async () => {
    const products = await request('products');
    return (Array.isArray(products) ? products : [])
      .filter(p => (p.stock || 0) <= (p.min_stock || 0))
      .map(p => {
        const target = Math.ceil((p.min_stock || 5) * 1.5);
        return {
          ...p,
          target_used: target,
          suggested_qty: Math.max(0, target - (p.stock || 0))
        };
      })
      .sort((a, b) => (b.ranking === 'AA' || b.ranking === 'A' ? 1 : -1));
  },

  recalculateMinStock: async () => {
    return { success: false, message: 'Recalculo requiere datos de ventas MySQL. Función deshabilitada en modo local.' };
  },

  getStockOutHistory: async () => {
    try {
      return await request('stock_out_history');
    } catch (e) {
      return [];
    }
  },

  // =====================================================================
  // MySQL Sync (may fail if MySQL is unreachable)
  // =====================================================================
  syncStatus: async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_BASE}/api/mysql-sync/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      return res.json();
    } catch (e) {
      return { error: e.message };
    }
  },

  getAliases: async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_BASE}/api/mysql-sync/aliases`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return res.ok ? res.json() : [];
    } catch (e) {
      return [];
    }
  },

  triggerSync: async () => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/api/mysql-sync/trigger`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error en la sincronización' }));
      throw new Error(err.error || 'Error en la sincronización');
    }
    return res.json();
  },

  generateOrder: async () => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/api/mysql-sync/generate-order`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error al generar el pedido' }));
      throw new Error(err.error || 'Error al generar el pedido');
    }
    return res.json();
  },

  downloadOrder: (filename) => downloadFile(`/api/mysql-sync/download-order/${filename}`, filename),

  getDuplicatesPreview: async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_BASE}/api/mysql-sync/duplicates-preview`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return res.ok ? res.json() : [];
    } catch (e) {
      return [];
    }
  },

  cleanupProducts: async () => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/api/mysql-sync/cleanup-duplicates`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  },

  searchProductsForMapping: async (q) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/api/mysql-sync/products-search?q=${encodeURIComponent(q)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.ok ? res.json() : [];
  },

  mapProduct: async (alias_name, product_id) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/api/mysql-sync/map`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ alias_name, product_id })
    });
    return res.json();
  },

  deleteAlias: async (id) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/api/mysql-sync/aliases/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  },

  // =====================================================================
  // Settings
  // =====================================================================
  getSettings: () => request('settings'),
  updateSettings: (data) => request('settings', 'update', '', data),

  // =====================================================================
  // Misc / Disabled in local mode
  // =====================================================================
  uploadDoctorsExcel: () => { throw new Error('Carga de Excel no disponible en modo estático'); },
  downloadExecutiveReport: () => { throw new Error('Reportes PDF no disponibles en modo estático'); },
  backupToGithub: () => { throw new Error('El respaldo automático requiere conexión a GitHub'); },
  downloadBackup: () => { throw new Error('Descarga de respaldo no disponible'); },
};
