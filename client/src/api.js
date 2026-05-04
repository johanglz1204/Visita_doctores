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

// Helper to handle Firestore dates
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
  getDashboard: async () => {
    const doctors = await request('doctors');
    const products = await request('products');
    const sales = await request('sales', 'get', null, { constraints: [limit(50), orderBy('date', 'desc')] });
    return { doctors, products, sales };
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
  getSales: (limitVal = 100, offset = 0, sucursal, startDate, endDate) => {
    const constraints = [orderBy('date', 'desc'), limit(limitVal)];
    if (sucursal) constraints.push(where('sucursal', '==', sucursal));
    // Firebase supports range filters but requires indexes
    return request('sales', 'get', null, { constraints });
  },
  
  // Note: These would need special handling with client-side libraries (like xlsx)
  uploadDoctorsExcel: () => { throw new Error('Carga de Excel no implementada en modo estático aún'); },
  downloadExecutiveReport: () => { throw new Error('Reportes PDF no implementados en modo estático aún'); },
};



