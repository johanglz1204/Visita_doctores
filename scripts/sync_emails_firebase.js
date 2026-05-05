/**
 * ============================================================
 * SCRIPT DE SINCRONIZACIÓN: Email (IMAP) → Firebase Firestore
 * ============================================================
 * Este script se ejecutará en GitHub Actions para procesar
 * las recetas que llegan por correo.
 */

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Configuración de Firebase
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = require(serviceAccountPath);
  } else {
    console.error('❌ Falta FIREBASE_SERVICE_ACCOUNT (Secret o archivo)');
    process.exit(1);
  }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function sync() {
  console.log('🚀 Iniciando sincronización de correos...');

  const client = new ImapFlow({
    host: process.env.EMAIL_HOST || 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    logger: false
  });

  try {
    await client.connect();
    let lock = await client.getMailboxLock('INBOX');
    
    try {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      
      let uids = await client.search({ since: fiveDaysAgo });
      
      if (uids.length === 0) {
        console.log('✅ No hay correos nuevos para procesar.');
        return;
      }

      console.log(`[SYNC] Encontrados ${uids.length} correos. Procesando...`);

      // Cargar catálogo de doctores y productos para mapeo rápido
      const doctorsSnap = await db.collection('doctors').get();
      const doctors = doctorsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name.toUpperCase() }));

      const productsSnap = await db.collection('products').get();
      const products = productsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name.toUpperCase() }));

      for await (let message of client.fetch(uids, { source: true })) {
        try {
          let parsed = await simpleParser(message.source);
          let rawContent = parsed.text || '';
          if (!rawContent && parsed.html) {
            rawContent = parsed.html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
          }
          const content = rawContent.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

          // Extraer sucursal
          const sucursalMatch = content.match(/Sucursal:\s*([^;\|\r\n]+?)(?=\s+Ticket:|\s+Nombre:|$)/i);
          const sucursal = sucursalMatch ? sucursalMatch[1].trim().toUpperCase() : 'MATRIZ';

          // Regex para encontrar ventas
          const salesMatch = content.matchAll(/Ticket:\s*(\d+).*?Nombre:\s*([^;\|\r\n]+?)\s*Piezas:\s*(\d+)\s*Doctor:\s*([^;\|\r\n]+?)\s*Fecha:\s*([\d\-\:\s]{10,20})/gi);
          
          for (const match of salesMatch) {
            const ticket = match[1];
            const productName = match[2].trim().toUpperCase();
            const quantity = parseInt(match[3], 10);
            const doctorName = match[4].trim().toUpperCase();
            const saleDate = match[5].trim().split(' ')[0]; // YYYY-MM-DD

            // 1. Buscar/Crear Doctor
            let doctorId;
            const existingDoc = doctors.find(d => d.name === doctorName);
            if (existingDoc) {
              doctorId = existingDoc.id;
            } else {
              const newDocRef = await db.collection('doctors').add({
                name: doctorName,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              });
              doctorId = newDocRef.id;
              doctors.push({ id: doctorId, name: doctorName });
              console.log(`   + Doctor creado: ${doctorName}`);
            }

            // 2. Buscar Producto
            const product = products.find(p => p.name === productName || productName.includes(p.name));
            if (!product) {
              console.warn(`   ⚠️ Producto no encontrado: ${productName}`);
              continue;
            }

            // 3. Registrar Venta (Evitar duplicados por Ticket)
            const legacyId = `email_${message.uid}_${ticket}`;
            const saleQuery = await db.collection('sales').where('legacyId', '==', legacyId).get();

            if (saleQuery.empty) {
              await db.collection('sales').add({
                doctor_id: doctorId,
                product_id: product.id,
                quantity: quantity,
                date: saleDate,
                sucursal: sucursal,
                legacyId: legacyId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              });

              // 4. Actualizar Stock (Opcional, si llevas stock en Firebase)
              await db.collection('products').doc(product.id).update({
                stock: admin.firestore.FieldValue.increment(-quantity),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });

              console.log(`   ✅ Venta registrada: ${productName} (${quantity}) - Ticket ${ticket}`);
            }
          }

          // Marcar como leído
          await client.messageFlagsAdd(message.uid, ['\\Seen']);

        } catch (msgErr) {
          console.error(`❌ Error procesando correo UID ${message.uid}:`, msgErr.message);
        }
      }

    } finally {
      if (lock) lock.release();
    }
    await client.logout();
    console.log('✅ Sincronización finalizada.');
  } catch (err) {
    console.error('❌ Error en conexión IMAP:', err.message);
    process.exit(1);
  }
}

sync();
