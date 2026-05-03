import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// This script accurately cleans and prepares content for chunks, to match the app's requirements.

const CONTENT_CHUNK_MOVIE_SIZE = 800;
const CONTENT_CHUNK_SERIES_SIZE = 300;

const FIELD_MAP: Record<string, string> = {
  year: 'yea',
  qualityId: 'qua',
  languageIds: 'lan',
  genreIds: 'gen',
  posterUrl: 'pos',
  seasons: 'sea',
  status: 'sta',
  createdAt: 'cre',
  updatedAt: 'upd',
  addedBy: 'uid',
  title: 'tit',
  imdbLink: 'imdb',
  movieLinks: 'lik',
  trailerUrl: 'trai',
  runtime: 'run',
  releaseDate: 'rdte',
};

function minifyContent(content: any): any {
  const minified: any = { id: content.id };
  for (const [key, value] of Object.entries(content)) {
    if (['id', 'trailerYoutubeTitle', 'addedByName', 'addedByRole', 'cast', 'country', 'description', 'type'].includes(key)) continue;
    
    if (key === 'seasons') {
        try {
            const seasons = typeof value === 'string' ? JSON.parse(value) : value;
            if (Array.isArray(seasons)) {
                minified[FIELD_MAP[key] || key] = seasons.map((s: any) => {
                    const mappedSeason: any = { s: s.seasonNumber };
                    if (s.episodes) {
                        mappedSeason.e = s.episodes.map((e: any) => {
                           const mappedEp: any = { t: e.title };
                           if (e.duration) mappedEp.d = e.duration;
                           if (e.links) mappedEp.l = e.links.map((l: any) => ({ n: l.name, u: l.url }));
                           return mappedEp;
                        });
                    }
                    return mappedSeason;
                });
            }
        } catch (e) {
            minified[FIELD_MAP[key] || key] = value;
        }
        continue;
    }
    
    const shortKey = FIELD_MAP[key] || key;
    if (['genreIds', 'languageIds'].includes(key) && Array.isArray(value)) {
      minified[shortKey] = value.join(',');
    } else {
      if (value !== undefined && value !== null) {
        minified[shortKey] = value;
      }
    }
  }
  return minified;
}

function cleanContentForChunk(content: any): any {
  const cleaned: any = { ...content };
  
  // The app's cleanContentForChunk historically deleted these
  delete cleaned.trailerYoutubeTitle;
  delete cleaned.type;
  
  // This helps ensure we don't store fields that aren't expected
  Object.keys(cleaned).forEach(key => {
    const val = cleaned[key];
    if (val === null || val === undefined || val === '') {
      delete cleaned[key];
    } else if (Array.isArray(val) && val.length === 0) {
      delete cleaned[key];
    } else if (key === 'seasons' && (val === '[]' || val === '')) {
      delete cleaned[key];
    }
  });

  return minifyContent(cleaned);
}

async function rebuildAllChunks() {
    try {
        const configPath = path.resolve(process.cwd(), './firebase-applet-config.json');
        const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)),
                projectId: firebaseConfig.projectId
            });
        }

        const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

        console.log("Fetching all content...");
        const contentSnap = await db.collection('content').get();
        if (contentSnap.empty) {
            console.log("No content found.");
            return;
        }

        const allContent: any[] = [];
        
        contentSnap.docs.forEach(doc => {
            const data = doc.data();
            const item = { ...data, id: doc.id };
            allContent.push(item);
        });

        console.log(`Found ${allContent.length} total items.`);

        // Sort globally by Order initially
        allContent.sort((a, b) => {
            const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
            const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
            
            if (orderA !== orderB) return orderA - orderB;
            
            // secondary sort by time
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return timeA - timeB;
        });

        const movies = allContent.filter(c => c.type === 'movie').map(cleanContentForChunk);
        const series = allContent.filter(c => c.type === 'series').map(cleanContentForChunk);

        const chunkDocs: Record<string, any> = {};

        const distribute = (items: any[], prefix: string, sizeLimit: number) => {
            let chunkIndex = 0;
            const queue = [...items];
            
            while (queue.length > 0) {
                const chunkItems = queue.splice(0, sizeLimit);
                const chunkId = `${prefix}${chunkIndex}`;
                const itemsMap: Record<string, any> = {};
                
                chunkItems.forEach(item => {
                     itemsMap[item.id] = item;
                });
                
                chunkDocs[chunkId] = itemsMap;
                chunkIndex++;
            }
        };

        distribute(movies, 'movie_chunk_', CONTENT_CHUNK_MOVIE_SIZE);
        distribute(series, 'series_chunk_', CONTENT_CHUNK_SERIES_SIZE);

        console.log(`Prepared ${Object.keys(chunkDocs).length} new chunks.`);

        let batches: any[] = [db.batch()];
        let opCount = 0;

        const checkBatch = () => {
             if (opCount >= 490) {
                batches.push(db.batch());
                opCount = 0;
             }
        };

        // Delete old chunks
        const oldChunksSnap = await db.collection('content_chunks').get();
        oldChunksSnap.docs.forEach(doc => {
            checkBatch();
            batches[batches.length - 1].delete(doc.ref);
            opCount++;
        });

        // Insert new chunks
        for (const [chunkId, items] of Object.entries(chunkDocs)) {
            checkBatch();
            const newRef = db.collection('content_chunks').doc(chunkId);
            batches[batches.length - 1].set(newRef, { items });
            opCount++;
        }

        // Update meta versions
        checkBatch();
        const metaUpdates: Record<string, number> = {};
        Object.keys(chunkDocs).forEach(id => {
            metaUpdates[id] = Date.now();
        });
        batches[batches.length - 1].set(db.collection('chunk_meta').doc('versions'), metaUpdates, { merge: true });
        opCount++;

        console.log(`Executing ${batches.length} batch(es)...`);
        await Promise.all(batches.map(b => b.commit()));

        console.log("✅ Successfully rebuilt all chunks securely.");

    } catch (e) {
        console.error("Error during rebuild:", e);
    }
}

rebuildAllChunks();
