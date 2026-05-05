const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function test() {
  try {
    const snap = await db.collection('products').limit(1).get();
    console.log('Read successful, found:', snap.size);
  } catch (err) {
    console.error('Test failed:', err.message);
    if (err.details) console.error('Details:', err.details);
  }
  process.exit();
}

test();
