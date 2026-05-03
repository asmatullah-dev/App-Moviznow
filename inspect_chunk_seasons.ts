import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

async function inspectChunkSeasons() {
    const configPath = path.resolve(process.cwd(), './firebase-applet-config.json');
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)),
            projectId: firebaseConfig.projectId
        });
    }

    const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

    const snap = await db.collection('content_chunks').limit(5).get();
    snap.docs.forEach(doc => {
        const data = doc.data();
        console.log("Chunk ID:", doc.id);
        const items = Object.values(data.items);
        if (items.length > 0) {
            console.log("Sample Item:", JSON.stringify(items[0], null, 2));
        }
    });
}
inspectChunkSeasons();
