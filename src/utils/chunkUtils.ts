import { doc, getDoc, getDocs, collection, writeBatch, setDoc, updateDoc, deleteField, QueryDocumentSnapshot, DocumentData, WriteBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Content } from '../types';

export const CONTENT_CHUNK_MOVIE_SIZE = 800;
export const CONTENT_CHUNK_SERIES_SIZE = 300;
// No search chunk size needed anymore as we use only content chunks

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

const REVERSE_FIELD_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([k, v]) => [v, k])
);

export function minifyContent(content: any): any {
  const minified: any = { id: content.id };
  for (const [key, value] of Object.entries(content)) {
    if (['id', 'trailerYoutubeTitle', 'addedByName', 'addedByRole', 'cast', 'country', 'description', 'type'].includes(key)) continue;
    
    if (key === 'trailerYoutubeId' && (!value || value === '[]')) continue;
    if (key === 'movieLinks' && (!value || value === '[]' || (Array.isArray(value) && value.length === 0) || content.type === 'series')) continue;
    
    if (key === 'seasons') {
        const val = value as any;
        if (!val || val === '[]' || (Array.isArray(val) && val.length === 0)) continue;
        
        let parsedSeasons = typeof val === 'string' ? JSON.parse(val) : val;
        const minSeasons = parsedSeasons.map((s: any) => {
            const ms: any = { sn: s.seasonNumber };
            if (s.isFullSeasonMKV) ms.fsm = 1;
            if (s.folderLink) ms.fl = s.folderLink;
            if (s.episodes && s.episodes.length > 0) {
               ms.eps = s.episodes.map((e: any) => {
                   const me: any = { en: e.episodeNumber };
                   if (e.title) me.ti = e.title;
                   if (e.links && e.links.length > 0) {
                       me.lks = e.links.map((l: any) => {
                           const ml: any = { ur: l.url };
                           if (l.name) ml.nm = l.name;
                           if (l.size) ml.sz = l.size;
                           if (l.unit) ml.un = l.unit;
                           return ml;
                       });
                   }
                   return me;
               });
            }
            if (s.links && s.links.length > 0) {
                 ms.lks = s.links.map((l: any) => {
                     const ml: any = { ur: l.url };
                     if (l.name) ml.nm = l.name;
                     if (l.size) ml.sz = l.size;
                     if (l.unit) ml.un = l.unit;
                     return ml;
                 });
            }
            return ms;
        });
        minified[FIELD_MAP[key] || key] = minSeasons;
        continue;
    }
    
    const shortKey = FIELD_MAP[key] || key;
    if (['genreIds', 'languageIds'].includes(key) && Array.isArray(value)) {
      minified[shortKey] = value.join(',');
    } else {
      minified[shortKey] = value;
    }
  }
  return minified;
}

export function expandContent(minified: any, chunkId?: string): Content {
  const expanded: any = { id: minified.id };
  
  if (chunkId) {
      if (chunkId.startsWith('movie_')) expanded.type = 'movie';
      if (chunkId.startsWith('series_')) expanded.type = 'series';
      expanded.chunkId = chunkId;
  } else {
      expanded.type = minified.sea ? 'series' : 'movie';
  }

  for (const [key, value] of Object.entries(minified)) {
    if (key === 'id') continue;
    const longKey = REVERSE_FIELD_MAP[key] || key;
    
    if (longKey === 'seasons') {
        const minSeasons = value as any[];
        const expandedSeasons = minSeasons.map((ms: any) => {
            const s: any = { seasonNumber: ms.sn };
            if (ms.fsm) s.isFullSeasonMKV = true;
            if (ms.fl) s.folderLink = ms.fl;
            if (ms.eps) {
                s.episodes = ms.eps.map((me: any) => {
                    const e: any = { episodeNumber: me.en };
                    if (me.ti) e.title = me.ti;
                    if (me.lks) {
                        e.links = me.lks.map((ml: any) => {
                            const l: any = { url: ml.ur };
                            if (ml.nm) l.name = ml.nm;
                            if (ml.sz) l.size = ml.sz;
                            if (ml.un) l.unit = ml.un;
                            return l;
                        });
                    }
                    return e;
                });
            }
            if (ms.lks) {
                s.links = ms.lks.map((ml: any) => {
                    const l: any = { url: ml.ur };
                    if (ml.nm) l.name = ml.nm;
                    if (ml.sz) l.size = ml.sz;
                    if (ml.un) l.unit = ml.un;
                    return l;
                });
            }
            return s;
        });
        expanded[longKey] = expandedSeasons;
        continue;
    }
    
    if (['genreIds', 'languageIds'].includes(longKey) && typeof value === 'string') {
        expanded[longKey] = value ? value.split(',') : [];
    } else {
        expanded[longKey] = value;
    }
  }
  return expanded as Content;
}

function registerChunkUpdates(chunkIds: string[], batch: WriteBatch) {
  const metaRef = doc(db, 'chunk_meta', 'versions');
  const updates: Record<string, number> = {};
  chunkIds.forEach(id => {
    updates[id] = Date.now();
  });
  batch.set(metaRef, updates, { merge: true });
}

export interface ContentChunk {
  items: Record<string, Content>;
}

export function cleanContentForChunk(content: Content): Content {
  const cleaned: any = { ...content };
  // delete cleaned.order; // PRESERVE ORDER
  delete cleaned.trailerYoutubeTitle;
  delete cleaned.type;

  // Remove empty values to save space
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

  return minifyContent(cleaned) as Content;
}

/**
 * Fetches all items from chunked collections
 */
export async function fetchAllFromChunks<T>(collectionName: string, mergeFn: (data: any, acc: T[]) => void): Promise<T[]> {
  const snapshot = await getDocs(collection(db, collectionName));
  const results: T[] = [];
  snapshot.docs.forEach(doc => {
    mergeFn(doc.data(), results);
  });
  return results;
}

/**
 * Saves or updates a single content item in the appropriate chunk
 */
export async function saveContentToChunk(rawContent: Content): Promise<void> {
  const content = cleanContentForChunk(rawContent);
  const chunksSnap = await getDocs(collection(db, 'content_chunks'));
  let targetDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  const expectedPrefix = content.type === 'movie' ? 'movie_chunk_' : 'series_chunk_';
  
  // 1. Check if item already exists in a chunk
  for (const doc of chunksSnap.docs) {
    const items = doc.data().items || {};
    if (items[content.id]) {
      targetDoc = doc;
      break;
    }
  }

  const batch = writeBatch(db);

  if (targetDoc) {
    // Update existing
    // Consider: what if it changed type? Very rare for movie <-> series, but possible.
    const docRef = targetDoc.ref;
    batch.update(docRef, {
      [`items.${content.id}`]: content
    });
    registerChunkUpdates([targetDoc.id], batch);
  } else {
    // Add new - Find first chunk with space and matching prefix
    let foundSpace = false;
    const sortedDocs = [...chunksSnap.docs]
      .filter(d => d.id.startsWith(expectedPrefix))
      .sort((a, b) => a.id.localeCompare(b.id));
    
    for (const doc of sortedDocs) {
      const items = doc.data().items || {};
      const maxSize = expectedPrefix === 'movie_chunk_' ? CONTENT_CHUNK_MOVIE_SIZE : CONTENT_CHUNK_SERIES_SIZE;
      if (Object.keys(items).length < maxSize) {
        batch.update(doc.ref, {
          [`items.${content.id}`]: content
        });
        registerChunkUpdates([doc.id], batch);
        foundSpace = true;
        break;
      }
    }

    if (!foundSpace) {
      // Create new chunk
      const nextId = `${expectedPrefix}${sortedDocs.length}`;
      const newRef = doc(db, 'content_chunks', nextId);
      batch.set(newRef, {
        items: { [content.id]: content }
      });
      registerChunkUpdates([nextId], batch);
    }
  }

  await batch.commit();
}

/**
 * Saves multiple content items to chunks efficiently
 */
export async function saveContentsToChunks(rawContents: Content[]): Promise<void> {
  const contents = rawContents.map(cleanContentForChunk);
  const chunksSnap = await getDocs(collection(db, 'content_chunks'));
  let currentChunks = chunksSnap.docs.map(d => ({ id: d.id, items: (d.data().items || {}) as Record<string, Content> }));
  
  const batch = writeBatch(db);
  const updatedChunkIds = new Set<string>();

  for (const content of contents) {
    let found = false;
    const expectedPrefix = content.type === 'movie' ? 'movie_chunk_' : 'series_chunk_';
    
    // 1. Try to update existing if present
    for (const chunk of currentChunks) {
      if (chunk.items[content.id]) {
        chunk.items[content.id] = content;
        updatedChunkIds.add(chunk.id);
        found = true;
        break;
      }
    }

    if (!found) {
      // 2. Add to first chunk with space and matching prefix
      let foundSpace = false;
      const matchingChunks = currentChunks.filter(c => c.id.startsWith(expectedPrefix));
      const sortedChunks = [...matchingChunks].sort((a, b) => a.id.localeCompare(b.id));
      
      for (const chunk of sortedChunks) {
        const maxSize = expectedPrefix === 'movie_chunk_' ? CONTENT_CHUNK_MOVIE_SIZE : CONTENT_CHUNK_SERIES_SIZE;
        if (Object.keys(chunk.items).length < maxSize) {
          chunk.items[content.id] = content;
          updatedChunkIds.add(chunk.id);
          foundSpace = true;
          break;
        }
      }

      if (!foundSpace) {
        // 3. Create new chunk
        const nextId = `${expectedPrefix}${matchingChunks.length}`;
        const newChunk = { id: nextId, items: { [content.id]: content } };
        currentChunks.push(newChunk);
        updatedChunkIds.add(nextId);
      }
    }
  }

  // Commit all affected chunks
  for (const chunkId of updatedChunkIds) {
    const chunk = currentChunks.find(c => c.id === chunkId);
    if (chunk) {
      batch.set(doc(db, 'content_chunks', chunkId), { items: chunk.items });
    }
  }

  registerChunkUpdates(Array.from(updatedChunkIds), batch);

  await batch.commit();
}

/**
 * Updates specific fields for multiple content items in their respective chunks
 */
export async function updateContentFieldsInChunks(updates: { id: string, [key: string]: any }[]): Promise<void> {
  const chunksSnap = await getDocs(collection(db, 'content_chunks'));
  
  // We may need multiple batches if updates exceed 500
  let batches = [writeBatch(db)];
  let operationCount = 0;
  
  const chunkUpdatesByBatch: Set<string>[] = [new Set()];

  for (const updateObj of updates) {
    const contentId = updateObj.id;
    for (const chunkDoc of chunksSnap.docs) {
      const items = chunkDoc.data().items || {};
      if (items[contentId]) {
        const docUpdates: Record<string, any> = {};
        for (const [key, value] of Object.entries(updateObj)) {
          if (key !== 'id') {
            const shortKey = FIELD_MAP[key] || key;
            docUpdates[`items.${contentId}.${shortKey}`] = value;
          }
        }
        
        if (operationCount >= 490) {
          batches.push(writeBatch(db));
          chunkUpdatesByBatch.push(new Set());
          operationCount = 0;
        }
        
        batches[batches.length - 1].update(chunkDoc.ref, docUpdates);
        chunkUpdatesByBatch[batches.length - 1].add(chunkDoc.id);
        operationCount++;
        break;
      }
    }
  }

  for (let i = 0; i < batches.length; i++) {
    if (chunkUpdatesByBatch[i].size > 0) {
      registerChunkUpdates(Array.from(chunkUpdatesByBatch[i]), batches[i]);
    }
  }

  await Promise.all(batches.map(b => b.commit()));
}


/**
 * Deletes a content item from its chunk
 */
export async function deleteContentFromChunk(contentId: string): Promise<void> {
  return deleteContentsFromChunks([contentId]);
}

/**
 * Deletes multiple content items from chunks efficiently
 */
export async function deleteContentsFromChunks(contentIds: string[]): Promise<void> {
  const chunksSnap = await getDocs(collection(db, 'content_chunks'));
  
  let batches = [writeBatch(db)];
  let operationCount = 0;
  const chunkUpdatesByBatch: Set<string>[] = [new Set()];

  for (const chunkDoc of chunksSnap.docs) {
    const items = chunkDoc.data().items || {};
    let chunkHasDeletes = false;
    const docUpdates: Record<string, any> = {};

    for (const id of contentIds) {
      if (items[id]) {
        docUpdates[`items.${id}`] = deleteField();
        chunkHasDeletes = true;
      }
    }

    if (chunkHasDeletes) {
      if (operationCount >= 490) {
        batches.push(writeBatch(db));
        chunkUpdatesByBatch.push(new Set());
        operationCount = 0;
      }
      batches[batches.length - 1].update(chunkDoc.ref, docUpdates);
      chunkUpdatesByBatch[batches.length - 1].add(chunkDoc.id);
      operationCount++;
    }
  }

  for (let i = 0; i < batches.length; i++) {
    if (chunkUpdatesByBatch[i].size > 0) {
      registerChunkUpdates(Array.from(chunkUpdatesByBatch[i]), batches[i]);
    }
  }

  await Promise.all(batches.map(b => b.commit()));
}

export async function getContentFromChunks(contentId: string): Promise<Content | null> {
  const chunksSnap = await getDocs(collection(db, 'content_chunks'));
  
  for (const chunkDoc of chunksSnap.docs) {
    const items = chunkDoc.data().items || {};
    if (items[contentId]) {
      return expandContent(items[contentId], chunkDoc.id);
    }
  }
  return null;
}

/**
 * Scans all chunks in Firestore and ensures chunk_meta/versions is up to date
 */
export async function repairChunkMetadata(): Promise<{ repairedContent: number }> {
  const batch = writeBatch(db);
  const now = Date.now();

  // 1. Repair content_chunks
  const contentSnap = await getDocs(collection(db, 'content_chunks'));
  const contentVersions: Record<string, number> = {};
  contentSnap.docs.forEach(d => {
    contentVersions[d.id] = now;
  });
  batch.set(doc(db, 'chunk_meta', 'versions'), contentVersions);

  await batch.commit();
  return { 
    repairedContent: contentSnap.size
  };
}

/**
 * Rebuilds all content chunks to enforce separation (movie_chunk_ vs series_chunk_)
 * and strips empty fields / order.
 */
export async function rebuildAllChunks(contents: Content[]): Promise<number> {
  const existingChunks = await getDocs(collection(db, 'content_chunks'));
  let batches = [writeBatch(db)];
  let opCount = 0;

  // 1. Delete all existing chunks
  for (const docSnap of existingChunks.docs) {
    if (opCount >= 490) {
      batches.push(writeBatch(db));
      opCount = 0;
    }
    batches[batches.length - 1].delete(docSnap.ref);
    opCount++;
  }

  // 2. Prepare new chunks
  // Sort global content by order then by createdAt (added time)
  const sortedContent = [...contents].sort((a, b) => {
    const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
  });

  const movies = sortedContent.filter(c => c.type === 'movie').map(cleanContentForChunk);
  const series = sortedContent.filter(c => c.type === 'series').map(cleanContentForChunk);

  const chunkDocs: Record<string, any> = {};

  const distribute = (items: Content[], prefix: string) => {
    let chunkIndex = 0;
    const maxSize = prefix === 'movie_chunk_' ? CONTENT_CHUNK_MOVIE_SIZE : CONTENT_CHUNK_SERIES_SIZE;
    while (items.length > 0) {
      const chunkItems = items.splice(0, maxSize);
      const chunkId = `${prefix}${chunkIndex}`;
      const itemsMap: Record<string, Content> = {};
      chunkItems.forEach(item => {
        itemsMap[item.id] = item;
      });
      chunkDocs[chunkId] = itemsMap;
      chunkIndex++;
    }
  };

  distribute(movies, 'movie_chunk_');
  distribute(series, 'series_chunk_');

  // 3. Insert new chunks
  for (const [chunkId, items] of Object.entries(chunkDocs)) {
    if (opCount >= 490) {
      batches.push(writeBatch(db));
      opCount = 0;
    }
    const newRef = doc(db, 'content_chunks', chunkId);
    batches[batches.length - 1].set(newRef, { items });
    opCount++;
  }

  // 4. Update versions meta
  if (opCount >= 490) {
    batches.push(writeBatch(db));
    opCount = 0;
  }
  const metaUpdates: Record<string, number> = {};
  Object.keys(chunkDocs).forEach(id => {
    metaUpdates[id] = Date.now();
  });
  batches[batches.length - 1].set(doc(db, 'chunk_meta', 'versions'), metaUpdates);

  // Execute all batches
  await Promise.all(batches.map(b => b.commit()));

  return Object.keys(chunkDocs).length;
}
