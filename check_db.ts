
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON not found in environment");
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
    projectId: firebaseConfig.projectId
});

const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

async function check() {
    const contentSnap = await db.collection('content').count().get();
    const chunksSnap = await db.collection('content_chunks').get();
    const metaSnap = await db.collection('chunk_meta').doc('versions').get();
    const versions = metaSnap.data() || {};
    
    const searchIndexSnap = await db.collection('search_index_chunks').get();
    const searchMetaSnap = await db.collection('chunk_meta').doc('search_index_versions').get();
    const searchVersions = searchMetaSnap.data() || {};

    console.log(`Content Collection Count: ${contentSnap.data().count}`);
    console.log(`Content Chunks Count: ${chunksSnap.size}`);
    console.log(`Versions in chunk_meta/versions: ${Object.keys(versions).length}`);
    Object.keys(versions).forEach(k => console.log(`- ${k}: ${versions[k]}`));
    
    let totalInChunks = 0;
    chunksSnap.docs.forEach(d => {
        const items = d.data().items || {};
        totalInChunks += Object.keys(items).length;
        console.log(`- Chunk ${d.id}: ${Object.keys(items).length} items`);
    });
    
    console.log(`Total Items in Chunks: ${totalInChunks}`);

    console.log(`\nSearch Index Chunks Count: ${searchIndexSnap.size}`);
    console.log(`Versions in chunk_meta/search_index_versions: ${Object.keys(searchVersions).length}`);
}

check().catch(console.error);
