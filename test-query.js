const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, limit, getDocs } = require('firebase/firestore');

const firebaseConfig = require('./firebase-applet-config.json');
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    const q = query(collection(db, "users"), where("email", "==", "test@example.com"), limit(5));
    const snap = await getDocs(q);
    console.log("Success! Docs:", snap.size);
  } catch (err) {
    console.error("Error:", err.message);
  }
}
run();
