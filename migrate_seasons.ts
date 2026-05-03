import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

async function migrateSeasons() {
    const configPath = path.resolve(process.cwd(), './firebase-applet-config.json');
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)),
            projectId: firebaseConfig.projectId
        });
    }

    const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

    console.log("Migrating series seasons in content_chunks (paginated)...");
    
    let lastDoc: any = null;
    let docsProcessed = 0;
    const pageSize = 50;
    
    while (true) {
        let query = db.collection('content_chunks').orderBy('__name__').limit(pageSize);
        if (lastDoc) {
            query = query.startAfter(lastDoc);
        }
        
        const snap = await query.get();
        if (snap.empty) break;
        
        for (const doc of snap.docs) {
            const data = doc.data();
            let changed = false;
            
            const newItems = { ...data.items };
            for (const itemId in newItems) {
                if (newItems[itemId].sea) {
                    const oldSeasons = newItems[itemId].sea;
                    
                    // Convert old ['s', 'e', 't', 'd', 'l', 'n', 'u'] format
                    // to chunkUtils.ts format ['sn', 'eps', 'ti', 'en', 'lks', 'nm', 'ur', 'sz', 'un']
                    const newSeasons = oldSeasons.map((s: any) => {
                        const sn: any = { sn: s.s }; // s -> sn
                        if (s.e) {
                            sn.eps = s.e.map((e: any) => {
                                const en: any = { en: e.en || 0 }; // e.en is episodeNumber
                                if (e.t) en.ti = e.t; // t -> ti
                                if (e.l) { // l -> lks
                                    en.lks = e.l.map((l: any) => {
                                        const link: any = { ur: l.u }; // u -> ur
                                        if (l.n) link.nm = l.n; // n -> nm
                                        return link;
                                    });
                                }
                                return en;
                            });
                        }
                        return sn;
                    });
                    
                    newItems[itemId].sea = newSeasons;
                    changed = true;
                }
            }
            
            if (changed) {
                await doc.ref.update({ items: newItems });
                docsProcessed++;
                console.log(`Migrated chunk ${doc.id}`);
            }
        }
        
        lastDoc = snap.docs[snap.docs.length - 1];
    }
    
    console.log(`Migrated ${docsProcessed} chunks in total.`);
}
migrateSeasons();
