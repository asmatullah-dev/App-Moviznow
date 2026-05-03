import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)),
    projectId: firebaseConfig.projectId
});

const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

async function listIds() {
    const genres = (await db.collection('genres').get()).docs.map(d => d.id);
    const languages = (await db.collection('languages').get()).docs.map(d => d.id);
    const qualities = (await db.collection('qualities').get()).docs.map(d => d.id);
    
    console.log('Genres:', genres);
    console.log('Languages:', languages);
    console.log('Qualities:', qualities);
}

listIds().catch(console.error);
