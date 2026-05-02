
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

async function repair() {
    console.log("🛠️ Starting Metadata Repair...");

    // 1. Repair content_chunks versions
    const chunksSnap = await db.collection('content_chunks').get();
    const newVersions: Record<string, number> = {};
    const now = Date.now();
    
    chunksSnap.docs.forEach(d => {
        newVersions[d.id] = now;
    });
    
    console.log(`Found ${chunksSnap.size} content chunks. Updating missing versions...`);
    await db.collection('chunk_meta').doc('versions').set(newVersions);
    console.log("✅ chunk_meta/versions updated.");

    // 2. Repair search_index_chunks versions
    const searchSnap = await db.collection('search_index_chunks').get();
    const newSearchVersions: Record<string, number> = {};
    
    searchSnap.docs.forEach(d => {
        newSearchVersions[d.id] = now;
    });
    
    console.log(`Found ${searchSnap.size} search index chunks. Updating missing versions...`);
    await db.collection('chunk_meta').doc('search_index_versions').set(newSearchVersions);
    console.log("✅ chunk_meta/search_index_versions updated.");

    console.log("🎉 Repair completed successfully!");
}

repair().catch(console.error);
