import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// TODO: Reemplaza esto con tu configuración de Firebase de la consola
// Puedes encontrar esto en: Project Settings > General > Your apps > Firebase SDK snippet
const firebaseConfig = {
  apiKey: "AIzaSyCUHFOiPFkDePN7iOhpRSUqmEpzE1o5xgA",
  authDomain: "visita-doctores.firebaseapp.com",
  projectId: "visita-doctores",
  storageBucket: "visita-doctores.firebasestorage.app",
  messagingSenderId: "530549613898",
  appId: "1:530549613898:web:3f7729e7d9a85aea080db3",
  measurementId: "G-LTXBTBG9P8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
