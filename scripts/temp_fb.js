const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function check() {
  const snap = await db.collection('products').get();
  let createdToday = 0;
  let old = 0;
  let noCreatedAt = 0;
  
  const today = new Date();
  today.setHours(0,0,0,0);
  
  snap.docs.forEach(doc => {
    const data = doc.data();
    if (!data.createdAt) {
      noCreatedAt++;
    } else {
      const d = data.createdAt.toDate();
      if (d > today) createdToday++;
      else old++;
    }
  });
  console.log(`Created today: ${createdToday}, Older: ${old}, No createdAt: ${noCreatedAt}, Total: ${snap.docs.length}`);
}
check();
