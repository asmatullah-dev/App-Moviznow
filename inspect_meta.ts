import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)),
    projectId: firebaseConfig.projectId
});

const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

async function inspectMeta() {
    const genres = (await db.collection('genres').get()).docs.map(d => ({id: d.id, ...d.data()}));
    const languages = (await db.collection('languages').get()).docs.map(d => ({id: d.id, ...d.data()}));
    const qualities = (await db.collection('qualities').get()).docs.map(d => ({id: d.id, ...d.data()}));
    
    console.log('Genres:', JSON.stringify(genres, null, 2));
    console.log('Languages:', JSON.stringify(languages, null, 2));
    console.log('Qualities:', JSON.stringify(qualities, null, 2));
}

inspectMeta().catch(console.error);
