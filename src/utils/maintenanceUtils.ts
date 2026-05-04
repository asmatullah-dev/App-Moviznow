import { Content } from '../types';
import { updateContentFieldsInChunks, repairChunkMetadata, rebuildAllChunks, cleanContentForChunk, CONTENT_CHUNK_MOVIE_SIZE, CONTENT_CHUNK_SERIES_SIZE } from './chunkUtils';
import { safeStorage } from './safeStorage';
import { collection, getDocs, writeBatch, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export async function migrateFromLegacyContent() {
    try {
        console.log('Fetching old contents from /content...');
        const snapshot = await getDocs(collection(db, 'content'));
        const allContents = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
        
        if (allContents.length === 0) return { success: true, migrated: 0 };
        
        console.log(`Found ${allContents.length} items. Sorting by createdAt ascending...`);
        
        allContents.sort((a, b) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return timeA - timeB;
        });

        // Delete old contents
        let batches = [writeBatch(db)];
        let opCount = 0;

        for (const c of snapshot.docs) {
            if (opCount >= 490) {
                batches.push(writeBatch(db));
                opCount = 0;
            }
            batches[batches.length - 1].delete(c.ref);
            opCount++;
        }

        // Delete existing chunks just in case to replace them completely
        const existingChunks = await getDocs(collection(db, 'content_chunks'));
        for (const c of existingChunks.docs) {
            if (opCount >= 490) {
                batches.push(writeBatch(db));
                opCount = 0;
            }
            batches[batches.length - 1].delete(c.ref);
            opCount++;
        }

        let movies: any[] = [];
        let series: any[] = [];

        // Apply order and clean
        allContents.forEach((raw, i) => {
            raw.order = i + 1; // 1, 2, 3...
            const cleaned = cleanContentForChunk(raw);
            if (raw.type === 'movie') {
                movies.push(cleaned);
            } else if (raw.type === 'series') {
                series.push(cleaned);
            }
        });

        console.log(`Movies: ${movies.length}, Series: ${series.length}`);

        const chunkDocs: Record<string, any> = {};

        const distribute = (items: any[], prefix: string) => {
            let chunkIndex = 0;
            const maxSize = prefix === 'movie_chunk_' ? CONTENT_CHUNK_MOVIE_SIZE : CONTENT_CHUNK_SERIES_SIZE;
            while (items.length > 0) {
                const chunkItems = items.splice(0, maxSize);
                const chunkId = `${prefix}${chunkIndex}`;
                const itemsMap: Record<string, any> = {};
                chunkItems.forEach(item => {
                    itemsMap[item.id] = item;
                });
                chunkDocs[chunkId] = itemsMap;
                chunkIndex++;
            }
        };

        distribute(movies, 'movie_chunk_');
        distribute(series, 'series_chunk_');

        for (const [chunkId, items] of Object.entries(chunkDocs)) {
            if (opCount >= 490) {
                batches.push(writeBatch(db));
                opCount = 0;
            }
            const newRef = doc(db, 'content_chunks', chunkId);
            batches[batches.length - 1].set(newRef, { items });
            opCount++;
        }

        if (opCount >= 490) {
            batches.push(writeBatch(db));
            opCount = 0;
        }
        const metaUpdates: Record<string, number> = {};
        Object.keys(chunkDocs).forEach(id => {
            metaUpdates[id] = Date.now();
        });
        batches[batches.length - 1].set(doc(db, 'chunk_meta', 'versions'), metaUpdates);

        console.log(`Executing ${batches.length} batches...`);
        for (let i = 0; i < batches.length; i++) {
            await batches[i].commit();
            console.log(`Batch ${i+1}/${batches.length} committed.`);
        }
        
        return { success: true, migrated: allContents.length };
    } catch (err) {
        console.error('Migration failed:', err);
        return { success: false, error: String(err) };
    }
}

export async function processChunksUpdateMetadataAndIds() {
    try {
        const [qSnap, lSnap, gSnap] = await Promise.all([
            getDocs(collection(db, 'qualities')),
            getDocs(collection(db, 'languages')),
            getDocs(collection(db, 'genres'))
        ]);

        const qs = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const ls = lSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const gs = gSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        const qMap: Record<string, string> = {}; 
        const lMap: Record<string, string> = {};
        const gMap: Record<string, string> = {};

        qs.forEach((x: any) => { if (x.list) x.list.forEach((item: any) => { if (item.name && item.id) qMap[item.name.toLowerCase().trim()] = item.id; }); });
        ls.forEach((x: any) => { if (x.list) x.list.forEach((item: any) => { if (item.name && item.id) lMap[item.name.toLowerCase().trim()] = item.id; }); });
        gs.forEach((x: any) => { if (x.list) x.list.forEach((item: any) => { if (item.name && item.id) gMap[item.name.toLowerCase().trim()] = item.id; }); });

        const oldQualities = [
  { id: "2wt4yOHkurQBQIDlJ3fB", name: "WEB-DL" },
  { id: "ceFubccYYvQIrNAiHuAh", name: "HDRip" },
  { id: "1o6pqtWcFDTMr3f8jh8l", name: "BluRay" },
  { id: "o8ftjcy0d", name: "WebRip" },
  { id: "s69dtyU6YLeFEDH6s3H9", name: "HDTV" },
  { id: "lA1Jb8F0HZVLAYszHCm0", name: "HDTC" },
  { id: "PGtJ4H1Zf3tJgARsRqN5", name: "HQ HDTC V2" },
  { id: "1Hp1uxZTNCFNsTqKKAhf", name: "HQ PreDVD" }
];
        const oldLanguages = [
  { id: "XBnJyd1zJAygv0JlGqkZ", name: "Urdu" },
  { id: "LKg6SO3XDiTVt2ttHekL", name: "Hindi" },
  { id: "9ve3esyic", name: "Hindi.HQ" },
  { id: "JabklRcfAjIpRcqPS1Er", name: "Hindi (Line)" },
  { id: "ZtoXGC6xNAvdZOc2VqIf", name: "Punjabi" },
  { id: "7M04St2iffCTM5P8q3c2", name: "Telugu" },
  { id: "EICGpi5ey9vYLv6Ilb56", name: "Tamil" },
  { id: "xZCXWCKuZ10sYZyM8OSL", name: "Malayalam" },
  { id: "z3RhJymau8jXbbXjCMVM", name: "Kannada" },
  { id: "HDly1QA28qZ1zpcY1R3U", name: "Gujrati" },
  { id: "71f5be3qr", name: "Japanese" },
  { id: "8juycvz1q", name: "Korean" },
  { id: "tpw65e1k8", name: "Swedish" },
  { id: "3b2uh3vwr", name: "Chinese" },
  { id: "fedghjpfr", name: "Indonesian" },
  { id: "qtnfvym7s", name: "Italian" },
  { id: "0wr9i7dbg", name: "Russian" },
  { id: "t0n15a5ji", name: "Arabic" },
  { id: "in0b14b4h", name: "Dutch" },
  { id: "Z7i5B5FLrVF34kAaI007", name: "English" }
];
        const oldGenres = [
  { id: "mnNE2ssM9H5V9gNk6s3D", name: "Action" },
  { id: "8qzWE4jC32MO8uY5jLrt", name: "Adventure" },
  { id: "49iyAkNmM8jo0R1mfdPL", name: "Animation" },
  { id: "8avUdp07UjpVk513F1qO", name: "Romantic" },
  { id: "vvahGIXjVsav4qxljz5P", name: "Comedy" },
  { id: "NWKKNo7McatNftT8RL8C", name: "Crime" },
  { id: "lyR1E4EaJ7xCIOwiz8Wa", name: "Thriller" },
  { id: "gVUgUruNrCLZ6AQcSWfw", name: "Horror" },
  { id: "9QRaVs1hr5AUFu1ahf6B", name: "Family" },
  { id: "5HcnM0RS4NCh163a4nL9", name: "Fantasy" },
  { id: "TKjnfid1qShTpgJ7PRsv", name: "Sci-Fi" },
  { id: "UbgiuCj6UsIfwQgOCmvV", name: "Suspense" },
  { id: "AHj3KEN2EGcMKkAIli4f", name: "Talk" },
  { id: "XK6WZT8OsjpHA61ePDaT", name: "Mystery" },
  { id: "QKar2XsdoT1odLxy2C1d", name: "Biography" },
  { id: "lgruWFSRxB4UXQFcOseI", name: "Social" },
  { id: "Oorb0GRKH0WIvruxPeMg", name: "Sport" },
  { id: "llVedgwJkNO6YAj21D2S", name: "Musical" },
  { id: "MFN8BVmBtAhCFbE0aRFn", name: "Historical" },
  { id: "tK5ycAolaTlildqTRVsT", name: "War" },
  { id: "KZDhWvavU0QfVuzfMRWM", name: "Documentary" },
  { id: "R4pdv3JcFvsLDu84VJgQ", name: "Psychological" },
  { id: "w3vigzy4w", name: "Revenge" },
  { id: "nvvr9j3f5", name: "Survival" },
  { id: "ol24k5ijc", name: "Spy" },
  { id: "flji4xs1l", name: "Emotional" },
  { id: "AxI6KeD4MZPFbRbROdAV", name: "Drama" }
];

        const oldIdToNameQ: Record<string, string> = {};
        for (const o of oldQualities) oldIdToNameQ[o.id] = o.name.toLowerCase().trim();

        const oldIdToNameL: Record<string, string> = {};
        for (const o of oldLanguages) oldIdToNameL[o.id] = o.name.toLowerCase().trim();

        const oldIdToNameG: Record<string, string> = {};
        for (const o of oldGenres) oldIdToNameG[o.id] = o.name.toLowerCase().trim();
        
        const chunksSnap = await getDocs(collection(db, 'content_chunks'));
        
        let batches = [writeBatch(db)];
        let opCount = 0;

        for (const docSnap of chunksSnap.docs) {
           const chunkData = docSnap.data().items || {};
           let chunkModified = false;
           for (const contentId of Object.keys(chunkData)) {
              const item = chunkData[contentId];
              
            if (item) {
                 // Format migration
                 if (item.trailerYoutubeTitle !== undefined) {
                     delete item.trailerYoutubeTitle;
                     chunkModified = true;
                 }
                 if (item.sta === 'published') {
                     item.sta = 'p';
                     chunkModified = true;
                 } else if (item.sta === 'draft') {
                     item.sta = 'd';
                     chunkModified = true;
                 }
                 for (const k of Object.keys(item)) {
                     if (item[k] === '[]' || item[k] === '') {
                         delete item[k];
                         chunkModified = true;
                     }
                 }

                 // Subtitles
                 if (item.subtitles !== undefined) {
                     if (item.subtitles === true || item.subtitles === 'true' || item.subtitles === 'yes') {
                         item.sub = 'yes';
                     }
                     delete item.subtitles;
                     chunkData[contentId] = item;
                     chunkModified = true;
                 }
                 if (item.sub === true) {
                     item.sub = 'yes';
                     chunkData[contentId] = item;
                     chunkModified = true;
                 }
                 if (item.sub === false || item.sub === 'no') {
                     delete item.sub;
                     chunkData[contentId] = item;
                     chunkModified = true;
                 }

                 // Quality
                 if (item.qua) {
                     const oldName = oldIdToNameQ[item.qua];
                     if (oldName && qMap[oldName]) {
                         item.qua = qMap[oldName];
                         chunkModified = true;
                     }
                 }
                 // Languages
                 if (item.lan && typeof item.lan === 'string') {
                     const oldIds = item.lan.split(',');
                     const newIds = oldIds.map((id: string) => {
                         const name = oldIdToNameL[id];
                         return (name && lMap[name]) ? lMap[name] : id;
                     });
                     const joined = newIds.join(',');
                     if (joined !== item.lan) {
                         item.lan = joined;
                         chunkModified = true;
                     }
                 }
                 // Genres
                 if (item.gen && typeof item.gen === 'string') {
                     const oldIds = item.gen.split(',');
                     const newIds = oldIds.map((id: string) => {
                         const name = oldIdToNameG[id];
                         return (name && gMap[name]) ? gMap[name] : id;
                     });
                     const joined = newIds.join(',');
                     if (joined !== item.gen) {
                         item.gen = joined;
                         chunkModified = true;
                     }
                 }
              }
           }
           if (chunkModified) {
               if (opCount >= 490) {
                   batches.push(writeBatch(db));
                   opCount = 0;
               }
               batches[batches.length - 1].set(doc(db, 'content_chunks', docSnap.id), { items: chunkData }, { merge: true });
               opCount++;
           }
        }

        if (opCount >= 490) {
           batches.push(writeBatch(db));
           opCount = 0;
        }
        const metaUpdates: Record<string, number> = {};
        for (const docSnap of chunksSnap.docs) {
            metaUpdates[docSnap.id] = Date.now();
        }
        batches[batches.length - 1].set(doc(db, 'chunk_meta', 'versions'), metaUpdates);

        for (let i = 0; i < batches.length; i++) {
            await batches[i].commit();
        }

        return { success: true };
    } catch (err) {
        console.error('Migration failed:', err);
        return { success: false, error: String(err) };
    }
}

export async function checkAndUpdateChunksLocal(contentList: Content[]): Promise<{updatedCount: number, updatedItems: {id: string, [key: string]: any}[]}> {
  let updatedCount = 0;
  const updates: {id: string, [key: string]: any}[] = [];

  contentList.forEach(item => {
    let needsUpdate = false;
    const updatePayload: {id: string, [key: string]: any} = { id: item.id };

    // Check for missing updatedAt
    if (!item.updatedAt) {
      updatePayload.updatedAt = item.createdAt || new Date().toISOString();
      needsUpdate = true;
    }

    if (needsUpdate) {
      updates.push(updatePayload);
      updatedCount++;
    }
  });

  return { updatedCount, updatedItems: updates };
}

export async function processChunkMaintenance(contentList: Content[], executeSync = false) {
  if (!executeSync) {
    const { updatedCount, updatedItems } = await checkAndUpdateChunksLocal(contentList);
    return { updatedCount, updatedItems, repairResult: null };
  }

  // Check if anything needs updating locally
  const { updatedCount, updatedItems } = await checkAndUpdateChunksLocal(contentList);

  // Apply updates to list in-memory first so we rebuild with correct data
  const memoryList = [...contentList];
  if (updatedCount > 0) {
    const map = new Map(updatedItems.map(i => [i.id, i]));
    for (let i = 0; i < memoryList.length; i++) {
        if (map.has(memoryList[i].id)) {
            memoryList[i] = { ...memoryList[i], ...map.get(memoryList[i].id) } as Content;
        }
    }
  }

  // Rebuild chunks (extract in locally then create chunks separately)
  const newChunksCount = await rebuildAllChunks(memoryList);

  const repairResult = await repairChunkMetadata();
  
  return { updatedCount, updatedItems, repairResult, newChunksCount };
}
