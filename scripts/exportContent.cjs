const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc } = require('firebase/firestore');

let firebaseConfig;
if (process.env.FIREBASE_CONFIG) {
  try {
    firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
  } catch (e) {
    console.error('Failed to parse FIREBASE_CONFIG env var:', e);
  }
}

if (!firebaseConfig) {
  const configPath = path.join(__dirname, '../firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
}

if (!firebaseConfig) {
  console.log('No config file or env var found. Using default embedded config fallback...');
  firebaseConfig = {
    projectId: "app-moviznow",
    firestoreDatabaseId: "moviznow-app",
    appId: "1:460140141169:web:c906282a0ae274657799d0",
    apiKey: "AIzaSyBogF7pfzJOkkIKu0190KurpQKIgDJ0CAg",
    authDomain: "app-moviznow.firebaseapp.com",
    storageBucket: "app-moviznow.firebasestorage.app",
    messagingSenderId: "460140141169",
    measurementId: "G-JFWSRZ18PK"
  };
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function exportCatalog() {
  console.log('Starting content catalog export from Firestore...');

  try {
    // 1. Export content chunks
    const contentChunksSnap = await getDocs(collection(db, 'content_chunks'));
    const allContentItems = [];

    contentChunksSnap.forEach((docSnap) => {
      const chunkId = docSnap.id;
      if (chunkId === 'metadata') return; // metadata doc is handled separately

      const data = docSnap.data();
      const itemsMap = data.items || {};

      Object.entries(itemsMap).forEach(([id, item]) => {
        allContentItems.push({
          id,
          chunkId,
          ...item
        });
      });
    });

    // Sort by order descending (or createdAt)
    allContentItems.sort((a, b) => (b.ord || 0) - (a.ord || 0));

    console.log(`Exported ${allContentItems.length} content items from ${contentChunksSnap.size} chunks.`);

    // 2. Export metadata
    let metadataObj = { genres: [], languages: [], qualities: [] };
    const metaSnap = await getDoc(doc(db, 'content_chunks', 'metadata'));
    if (metaSnap.exists()) {
      metadataObj = metaSnap.data();
      console.log(`Exported metadata: ${metadataObj.genres?.length || 0} genres, ${metadataObj.languages?.length || 0} languages, ${metadataObj.qualities?.length || 0} qualities.`);
    }

    // 3. Export collections
    let collectionsObj = { items: {} };
    const collSnap = await getDoc(doc(db, 'collection_chunks', 'collection_chunk_0'));
    if (collSnap.exists()) {
      collectionsObj = collSnap.data();
      console.log(`Exported ${Object.keys(collectionsObj.items || {}).length} collections.`);
    }

    // 4. Save output JSON files
    const nowIso = new Date().toISOString();
    const exportData = {
      exportedAt: nowIso,
      version: nowIso,
      content: allContentItems,
      metadata: metadataObj,
      collections: collectionsObj
    };
    
    const exportFileName = 'moviznow_catalog_export.json';
    const jsonString = JSON.stringify(exportData);

    const publicDir = path.join(__dirname, '..', 'public');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

    const srcDataDir = path.join(__dirname, '..', 'src', 'data');
    if (!fs.existsSync(srcDataDir)) fs.mkdirSync(srcDataDir, { recursive: true });

    fs.writeFileSync(path.join(__dirname, '..', exportFileName), jsonString);
    fs.writeFileSync(path.join(publicDir, exportFileName), jsonString);
    fs.writeFileSync(path.join(srcDataDir, exportFileName), jsonString);

    console.log('Successfully saved unified content export file to root, public/, and src/data/');

    // 5. Export reviews from Firestore
    console.log('Starting reviews export from Firestore...');
    let allReviews = [];
    try {
      const reviewDocSnap = await getDoc(doc(db, 'review_chunks', 'main'));
      if (reviewDocSnap.exists()) {
        const items = reviewDocSnap.data().items || {};
        allReviews = Object.values(items);
        allReviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }
    } catch (e) {
      console.error('Error fetching reviews during export:', e);
    }

    const reviewsFileName = 'moviznow_reviews_export.json';
    const reviewsJsonString = JSON.stringify(allReviews);

    fs.writeFileSync(path.join(__dirname, '..', reviewsFileName), reviewsJsonString);
    fs.writeFileSync(path.join(publicDir, reviewsFileName), reviewsJsonString);
    fs.writeFileSync(path.join(srcDataDir, reviewsFileName), reviewsJsonString);

    console.log(`Successfully saved ${allReviews.length} reviews to root, public/, and src/data/`);
    process.exit(0);
  } catch (error) {
    console.error('Error during catalog export:', error);
    process.exit(1);
  }
}

exportCatalog();
