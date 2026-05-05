import { 
  collection, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  increment
} from "firebase/firestore";
import { 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged 
} from "firebase/auth";
import { db, auth } from "./firebaseConfig";

// Helper to handle Firestore dates (v1.0.2)
const formatFirestoreData = (doc) => {
  const data = doc.data();
  return { id: doc.id, ...data };
};

async function request(collectionName, operation = 'get', idOrData = null, extra = null) {
  try {
    const colRef = collection(db, collectionName);
    
    switch (operation) {
      case 'get':
        if (idOrData && typeof idOrData === 'string') {
          const docRef = doc(db, collectionName, idOrData);
          const docSnap = await getDoc(docRef);
          return formatFirestoreData(docSnap);
        } else {
          let q = query(colRef);
          if (extra && extra.constraints) {
            q = query(colRef, ...extra.constraints);
          }
          const snapshot = await getDocs(q);
          return snapshot.docs.map(formatFirestoreData);
        }
      case 'add':
        const newDoc = await addDoc(colRef, {
          ...idOrData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return { id: newDoc.id, ...idOrData };
      case 'update':
        const updateRef = doc(db, collectionName, idOrData);
        await updateDoc(updateRef, {
          ...extra,
          updatedAt: serverTimestamp()
        });
        return { id: idOrData, ...extra };
      case 'delete':
        const deleteRef = doc(db, collectionName, idOrData);
        await deleteDoc(deleteRef);
        return { id: idOrData, success: true };
      default:
        throw new Error('Operación no soportada');
    }
  } catch (error) {
    console.error(`Error en Firestore (${collectionName} - ${operation}):`, error);
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
  login: (email, password) => signInWithEmailAndPassword(auth, email, password),
  logout: () => signOut(auth),
  onAuthStateChanged: (callback) => onAuthStateChanged(auth, callback),

  // Dashboard
  getDashboard: async (days = 30, branchFilter = 'all') => {
    const doctors = await request('doctors');
    const products = await request('products');
    const sales = await request('sales', 'get', null, { 
      constraints: [orderBy('date', 'desc')] 
    });
    let mysqlSales = [];
    try {
      mysqlSales = await request('mysql_sales', 'get', null, { 
        constraints: [orderBy('sale_date', 'desc')] 
      });
    } catch (e) {
      console.warn("No se pudo cargar mysql_sales, tal vez la colección aún no existe o falta índice:", e);
    }

    // Filtro de fecha para el periodo
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(now.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const periodSales = sales.filter(s => s.date >= cutoffStr);
    const periodMysqlSales = mysqlSales.filter(s => {
      if (s.sale_date < cutoffStr) return false;
      if (branchFilter !== 'all' && s.sucursal !== branchFilter) return false;
      return true;
    });

    // Cálculos para Dashboard.jsx
    const stats = {
      totalDoctors: doctors.length,
      totalProducts: products.length,
      criticalRankedProducts: products.filter(p => {
        if (p.ranking !== 'AA' && p.ranking !== 'A') return false;
        const relevantStock = branchFilter !== 'all' ? ((p.stock_by_branch || {})[branchFilter] || 0) : (p.stock || 0);
        return relevantStock <= (p.min_stock || 5);
      }).map(p => ({
        ...p,
        stock: branchFilter !== 'all' ? ((p.stock_by_branch || {})[branchFilter] || 0) : (p.stock || 0)
      })),
      
      // Tendencia de ventas reales (desde MySQL)
      salesTrend: periodMysqlSales.reduce((acc, s) => {
        const qty = Number(s.quantity || 0);
        const existing = acc.find(item => item.date === s.sale_date);
        if (existing) existing.total_quantity += qty;
        else acc.push({ date: s.sale_date, total_quantity: qty });
        return acc;
      }, []).sort((a, b) => a.date.localeCompare(b.date)),

      // Estadísticas por sucursal
      sucursalStats: periodMysqlSales.reduce((acc, s) => {
        const qty = Number(s.quantity || 0);
        const suc = s.sucursal || 'Desconocida';
        const existing = acc.find(item => item.name === suc);
        if (existing) existing.value += qty;
        else acc.push({ name: suc, value: qty });
        return acc;
      }, []),

      // Desempeño por Línea
      lineStats: periodMysqlSales.reduce((acc, s) => {
        if (!s.sector) return acc;
        const qty = Number(s.quantity || 0);
        const existing = acc.find(item => item.line === s.sector);
        if (existing) existing.value += qty;
        else acc.push({ line: s.sector, value: qty });
        return acc;
      }, []).sort((a, b) => b.value - a.value).slice(0, 10),

      // Top Doctores (se mantiene desde la sync de correos)
      topDoctors: periodSales.reduce((acc, s) => {
        if (!s.doctor_id) return acc;
        const qty = Number(s.quantity || 0);
        const docName = doctors.find(d => String(d.id || d.legacyId) === String(s.doctor_id))?.name || 'Desconocido';
        const existing = acc.find(item => item.doctor === docName);
        if (existing) existing.total_prescriptions += qty;
        else acc.push({ doctor: docName, total_prescriptions: qty });
        return acc;
      }, []).sort((a, b) => b.total_prescriptions - a.total_prescriptions).slice(0, 5),

      // Pronóstico de inventario basado en ventas MySQL
      inventoryForecast: products.filter(p => {
        const relevantStock = branchFilter !== 'all' ? ((p.stock_by_branch || {})[branchFilter] || 0) : (p.stock || 0);
        return relevantStock < 100;
      }).map(p => {
        const prodSales = periodMysqlSales.filter(s => String(s.barcode) === String(p.barcode));
        const salesPeriod = prodSales.reduce((acc, s) => acc + Number(s.quantity || 0), 0);
        const dailyRate = salesPeriod / days;
        const relevantStock = branchFilter !== 'all' ? ((p.stock_by_branch || {})[branchFilter] || 0) : (p.stock || 0);
        return {
          ...p,
          stock: relevantStock,
          sales_30d: salesPeriod, // Ventas del periodo seleccionado
          days_left: dailyRate > 0 ? Math.round(relevantStock / dailyRate) : 999
        };
      }).sort((a, b) => a.days_left - b.days_left).slice(0, 10),

      lastSyncTime: new Date().toISOString()
    };

    console.log('Dashboard stats calculated');
    return stats;
  },

  getCriticalStock: async () => {
    const products = await request('products');
    return products.filter(p => p.stock <= (p.min_stock || 5));
  },

  // Doctors
  getDoctors: () => request('doctors'),
  getDoctor: (id) => request('doctors', 'get', id),
  createDoctor: (data) => request('doctors', 'add', data),
  updateDoctor: (id, data) => request('doctors', 'update', id, data),
  deleteDoctor: (id) => request('doctors', 'delete', id),
  getDoctorVisits: (id) => request('visits', 'get', null, { constraints: [where('doctor_id', '==', id)] }),
  createDoctorVisit: (id, data) => request('visits', 'add', { ...data, doctor_id: id }),
  deleteDoctorVisit: (id, visitId) => request('visits', 'delete', visitId),

  // Products
  getProducts: () => request('products'),
  getProduct: (id) => request('products', 'get', id),
  createProduct: (data) => request('products', 'add', data),
  updateProduct: (id, data) => request('products', 'update', id, data),
  deleteProduct: (id) => request('products', 'delete', id),

  // Inventory
  getInventory: () => request('inventory'),
  createInventory: (data) => request('inventory', 'add', data),
  updateInventory: (id, data) => request('inventory', 'update', id, data),
  deleteInventory: (id) => request('inventory', 'delete', id),

  // Sales
  getSales: async (limitVal = 100, offset = 0, sucursal, startDate, endDate) => {
    const doctors = await request('doctors');
    const products = await request('products');
    const sales = await request('sales', 'get', null, { 
      constraints: [orderBy('date', 'desc')] 
    });

    let filtered = sales;
    if (sucursal && sucursal !== 'TODAS' && sucursal !== 'todas') {
      filtered = filtered.filter(s => s.sucursal === sucursal);
    }
    if (startDate) {
      filtered = filtered.filter(s => s.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(s => s.date <= endDate);
    }

    // Resolver nombres y ajustar campos para Sales.jsx
    const resolved = filtered.map(s => ({
      ...s,
      doctor_name: doctors.find(d => String(d.id || d.legacyId) === String(s.doctor_id))?.name || 'Desconocido',
      product_name: products.find(p => String(p.id || p.legacyId) === String(s.product_id))?.name || 'Desconocido',
      sale_date: s.date, // Alias para UI
      created_at: s.createdAt?.toDate ? s.createdAt.toDate() : new Date(), // Convertir Firestore Timestamp
    }));

    return resolved;
  },

  getBranches: async () => {
    const sales = await request('sales');
    const branches = [...new Set(sales.map(s => s.sucursal).filter(Boolean))];
    return branches;
  },
  
  exportProductsExcel: () => { throw new Error('Exportación a Excel no disponible en modo estático'); },
  syncStatus: async () => {
    // Retornar un estado vacío para modo estático
    return {
      last_sync: null,
      matched_list: [],
      unmatched_list: []
    };
  },
  getAliases: async () => [],
  triggerSync: async () => { throw new Error('La sincronización requiere un servidor activo'); },
  getDuplicatesPreview: async () => ({ duplicates_to_delete: 0, duplicate_groups: 0 }),
  cleanupProducts: async () => { throw new Error('Limpieza de duplicados no disponible en modo estático'); },
  searchProductsForMapping: async (query) => {
    const products = await request('products');
    return products.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
  },
  mapProduct: async () => { throw new Error('Mapeo manual no disponible en modo estático'); },
  deleteAlias: async () => { throw new Error('Gestión de alias no disponible en modo estático'); },

  // Note: These would need special handling with client-side libraries (like xlsx)
  uploadDoctorsExcel: () => { throw new Error('Carga de Excel no disponible en modo estático'); },
  downloadExecutiveReport: () => { throw new Error('Reportes PDF no disponibles en modo estático aún'); },
  syncEmails: () => { 
    return Promise.resolve({ message: 'La sincronización ahora es automática cada hora vía GitHub Actions' });
  },
  // Inventory Planning
  getSuggestedOrders: async () => {
    const products = await request('products');
    return products
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

  getStockOutHistory: async () => {
    try {
      return await request('stock_out_history', 'get', null, {
        constraints: [orderBy('start_date', 'desc'), limit(50)]
      });
    } catch (e) {
      console.warn("Colección stock_out_history no encontrada:", e);
      return [];
    }
  },

  recalculateMinStock: async ({ safetyDays = 15, ranking = 'AA,A' } = {}) => {
    const products = await request('products');
    const mysqlSales = await request('mysql_sales', 'get', null, { 
      constraints: [orderBy('sale_date', 'desc'), limit(5000)] 
    });

    const days = 90; // Análisis de 90 días
    const updatedProducts = [];
    const rankingArray = ranking.split(',');

    for (const p of products) {
      if (rankingArray.includes(p.ranking)) {
        const prodSales = mysqlSales.filter(s => String(s.barcode) === String(p.barcode));
        const totalQty = prodSales.reduce((acc, s) => acc + s.quantity, 0);
        const dailyRate = totalQty / days;
        const newMin = Math.ceil(dailyRate * safetyDays);

        if (newMin !== p.min_stock) {
          await request('products', 'update', p.id, { min_stock: newMin });
          updatedProducts.push(p.name);
        }
      }
    }

    return { 
      success: true, 
      message: `Se actualizaron los mínimos de ${updatedProducts.length} productos basados en ventas reales.` 
    };
  },

  backupToGithub: () => { throw new Error('El respaldo automático requiere un servidor activo'); },
  downloadBackup: () => { throw new Error('Descarga de respaldo no disponible'); },
};



