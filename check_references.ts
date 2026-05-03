import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)),
    projectId: firebaseConfig.projectId
});

const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

async function check() {
    const genres = new Set((await db.collection('genres').get()).docs.map(d => d.id));
    const languages = new Set((await db.collection('languages').get()).docs.map(d => d.id));
    const qualities = new Set((await db.collection('qualities').get()).docs.map(d => d.id));
    
    const chunksSnap = await db.collection('content_chunks').get();
    let issues = 0;
    
    chunksSnap.docs.forEach(doc => {
        const items = doc.data().items || {};
        Object.values(items).forEach((item: any) => {
            // Check qualityId
            if (item.qua && !qualities.has(item.qua)) {
                console.log(`Item ${item.id} has invalid qualityId: ${item.qua}`);
                issues++;
            }
            // Check genreIds
            if (item.gen && Array.isArray(item.gen)) {
                item.gen.forEach((gid: string) => {
                   if (!genres.has(gid)) {
                       console.log(`Item ${item.id} has invalid genreId: ${gid}`);
                       issues++;
                   }
                });
            }
            // Check languageIds
            if (item.lan && Array.isArray(item.lan)) {
                item.lan.forEach((lid: string) => {
                   if (!languages.has(lid)) {
                       console.log(`Item ${item.id} has invalid languageId: ${lid}`);
                       issues++;
                   }
                });
            }
        });
    });
    console.log(`Total issues found: ${issues}`);
}

check().catch(console.error);
