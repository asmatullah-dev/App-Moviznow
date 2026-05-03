import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

async function inspectContent() {
    const configPath = path.resolve(process.cwd(), './firebase-applet-config.json');
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)),
            projectId: firebaseConfig.projectId
        });
    }

    const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
    
    // Get one item
    const snap = await db.collection('content').limit(1).get();
    if (!snap.empty) {
        console.log("Content Item:", JSON.stringify(snap.docs[0].data(), null, 2));
    }
}
inspectContent();
