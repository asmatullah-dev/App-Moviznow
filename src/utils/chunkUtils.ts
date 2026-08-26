import { doc, getDoc, getDocs, collection, writeBatch, setDoc, updateDoc, deleteField, serverTimestamp, QueryDocumentSnapshot, DocumentData, WriteBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Content } from '../types';
import { getChunkMeta, clearChunkMetaCache } from './chunkMeta';
import { runWithNetwork } from '../firebase';
import { safeStorage } from './safeStorage';
import staticReviews from '../data/moviznow_reviews_export.json';

export const CONTENT_CHUNK_MOVIE_SIZE = 500;
export const CONTENT_CHUNK_SERIES_SIZE = 200;
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
  subtitles: 'sub',
  description: 'dsc',
  cast: 'cst',
  country: 'cnt',
  ottPlatform: 'ott',
  order: 'ord',
  id: 'id'
};

const REVERSE_FIELD_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([k, v]) => [v, k])
);

export function minifyContent(content: any): any {
  const minified: any = {};
  for (const [key, value] of Object.entries(content)) {
    if (['trailerYoutubeTitle', 'addedByName', 'addedByRole', 'type'].includes(key)) continue;
    
    if (key === 'status') {
      minified[FIELD_MAP[key] || key] = value === 'published' ? 'p' : (value === 'draft' ? 'd' : value);
      continue;
    }

    if (key === 'movieLinks') {
        const val = value as any;
        if (!val || val === '[]' || (Array.isArray(val) && val.length === 0) || content.type === 'series') continue;
        const parsed = typeof val === 'string' ? JSON.parse(val) : val;
        minified[FIELD_MAP[key] || key] = parsed.map((l: any) => {
             const ml: any = {};
             if (l.url) ml.ur = l.url;
             if (l.name) ml.nm = l.name;
             if (l.size) ml.sz = l.size;
             if (l.unit) ml.un = l.unit;
             return ml;
        });
        continue;
    }
    
    if (key === 'trailerYoutubeId' && (!value || value === '[]')) continue;
    
    if (key === 'seasons') {
        const val = value as any;
        if (!val || val === '[]' || (Array.isArray(val) && val.length === 0)) continue;
        
        let parsedSeasons = typeof val === 'string' ? JSON.parse(val) : val;
        const minSeasons = parsedSeasons.map((s: any) => {
            const ms: any = { sn: s.seasonNumber };
            if (s.title) ms.ti = s.title;
            if (s.year) ms.yea = s.year;
            if (s.trailerUrl) ms.trai = s.trailerUrl;
            if (s.isFullSeasonMKV) ms.fsm = 1;
            if (s.folderLink) ms.fl = s.folderLink;
            if (s.episodes && s.episodes.length > 0) {
               ms.eps = s.episodes.map((e: any) => {
                   const me: any = { en: e.episodeNumber };
                   if (e.title) me.ti = e.title;
                   if (e.description) me.de = e.description;
                   if (e.duration) me.du = e.duration;
                   if (e.links && e.links.length > 0) {
                       me.lks = e.links.map((l: any) => {
                           const ml: any = {};
                           if (l.url) ml.ur = l.url;
                           if (l.name) ml.nm = l.name;
                           if (l.size) ml.sz = l.size;
                           if (l.unit) ml.un = l.unit;
                           return ml;
                       });
                   }
                   return me;
               });
            }
            if (s.zipLinks && s.zipLinks.length > 0) {
                 ms.zl = s.zipLinks.map((l: any) => {
                     const ml: any = {};
                     if (l.url) ml.ur = l.url;
                     if (l.name) ml.nm = l.name;
                     if (l.size) ml.sz = l.size;
                     if (l.unit) ml.un = l.unit;
                     return ml;
                 });
            }
            if (s.mkvLinks && s.mkvLinks.length > 0) {
                 ms.ml = s.mkvLinks.map((l: any) => {
                     const ml: any = {};
                     if (l.url) ml.ur = l.url;
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
    if (['genreIds', 'languageIds', 'cast'].includes(key) && Array.isArray(value)) {
      minified[shortKey] = value.join(',');
    } else if (key === 'subtitles' && value === true) {
      minified[shortKey] = 'yes';
    } else {
      minified[shortKey] = value;
    }
  }
  return minified;
}

export function expandContent(minified: any, chunkId?: string): Content {
  const expanded: any = { id: minified.id };
  
  const normalizedChunkId = chunkId ? chunkId.replace('content_chunk_', '') : undefined;
  if (normalizedChunkId) {
    expanded.chunkId = normalizedChunkId;
    if (normalizedChunkId.startsWith('movie_')) expanded.type = 'movie';
    else if (normalizedChunkId.startsWith('series_')) expanded.type = 'series';
    else expanded.type = minified.sea ? 'series' : 'movie';
  } else {
    expanded.type = minified.sea ? 'series' : 'movie';
  }

  for (const [key, value] of Object.entries(minified)) {
    if (key === 'id') continue;
    const longKey = REVERSE_FIELD_MAP[key] || key;
    
    if (longKey === 'movieLinks') {
        const minLinks = typeof value === 'string' ? JSON.parse(value) : value as any[];
        expanded[longKey] = JSON.stringify(minLinks.map((ml: any) => {
            const l: any = { url: ml.ur || ml.url };
            if (ml.nm || ml.name) l.name = ml.nm || ml.name;
            if (ml.sz || ml.size) l.size = ml.sz || ml.size;
            if (ml.un || ml.unit) l.unit = ml.un || ml.unit;
            return l;
        }));
        continue;
    }

    if (longKey === 'seasons') {
        const minSeasons = value as any[];
        const expandedSeasons = minSeasons.map((ms: any) => {
            const s: any = { id: `s${ms.sn}`, seasonNumber: ms.sn };
            if (ms.ti) s.title = ms.ti;
            if (ms.yea) s.year = ms.yea;
            if (ms.trai) s.trailerUrl = ms.trai;
            if (ms.fsm) s.isFullSeasonMKV = true;
            if (ms.fl) s.folderLink = ms.fl;
            if (ms.eps) {
                s.episodes = ms.eps.map((me: any) => {
                    const e: any = { id: `e${me.en}`, episodeNumber: me.en };
                    if (me.ti) e.title = me.ti;
                    if (me.de) e.description = me.de;
                    if (me.du) e.duration = me.du;
                    if (me.lks) {
                        e.links = me.lks.map((ml: any) => {
                            const l: any = { url: ml.ur || ml.url };
                            if (ml.nm || ml.name) l.name = ml.nm || ml.name;
                            if (ml.sz || ml.size) l.size = ml.sz || ml.size;
                            if (ml.un || ml.unit) l.unit = ml.un || ml.unit;
                            return l;
                        });
                    }
                    return e;
                });
            }
            if (ms.zl) {
                s.zipLinks = ms.zl.map((ml: any) => {
                    const l: any = { url: ml.ur || ml.url };
                    if (ml.nm || ml.name) l.name = ml.nm || ml.name;
                    if (ml.sz || ml.size) l.size = ml.sz || ml.size;
                    if (ml.un || ml.unit) l.unit = ml.un || ml.unit;
                    return l;
                });
            }
            if (ms.ml) {
                s.mkvLinks = ms.ml.map((ml: any) => {
                    const l: any = { url: ml.ur || ml.url };
                    if (ml.nm || ml.name) l.name = ml.nm || ml.name;
                    if (ml.sz || ml.size) l.size = ml.sz || ml.size;
                    if (ml.un || ml.unit) l.unit = ml.un || ml.unit;
                    return l;
                });
            }
            return s;
        });
        expanded[longKey] = JSON.stringify(expandedSeasons);
        continue;
    }
    
    if (['genreIds', 'languageIds', 'cast'].includes(longKey) && typeof value === 'string') {
        expanded[longKey] = value ? value.split(',') : [];
    } else if (longKey === 'subtitles') {
        expanded[longKey] = (value === 'yes' || value === true);
    } else if (longKey === 'status') {
        expanded[longKey] = value === 'p' ? 'published' : (value === 'd' ? 'draft' : value);
    } else {
        expanded[longKey] = value;
    }
  }
  return expanded as Content;
}

function registerChunkUpdates(chunkIds: string[], batch: WriteBatch, sizes?: Record<string, number>) {
  const metaRef = doc(db, 'chunk_meta', 'versions');
  const updates: Record<string, any> = {};
  const now = Date.now();
  chunkIds.forEach(id => {
    if (sizes && sizes[id] !== undefined) {
      updates[id] = { version: now, count: sizes[id] };
    } else {
      updates[id] = { version: now };
    }
  });
  batch.set(metaRef, updates, { merge: true });
}

export interface ContentChunk {
  items: Record<string, Content>;
}

export function cleanContentForChunk(content: Content): Content {
  const cleaned: any = { ...content };
  delete cleaned.chunkId; // Remove chunkId before saving to chunk
  delete cleaned.trailerYoutubeTitle;
  delete cleaned.type;

  // Remove empty values to save space
  Object.keys(cleaned).forEach(key => {
    const val = cleaned[key];
    if (val === null || val === undefined || val === '' || val === false || val === '[]') {
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
  return saveContentsToChunks([rawContent]);
}

/**
 * Saves multiple content items to chunks efficiently
 */
export async function saveContentsToChunks(rawContents: Content[]): Promise<void> {
  const contents = rawContents.map(raw => ({
    content: cleanContentForChunk(raw),
    rawType: raw.type,
    chunkId: raw.chunkId
  }));
  
  const batch = writeBatch(db);
  const updatedChunkIds = new Set<string>();

  const unknownContents = contents.filter(c => !c.chunkId);
  let maxMovieIndex = -1;
  let maxSeriesIndex = -1;

  if (unknownContents.length > 0) {
    const metaDoc = await getDoc(doc(db, 'chunk_meta', 'versions'));
    const metaData = metaDoc.exists() ? metaDoc.data() : {};
    for (const key of Object.keys(metaData)) {
      if (key.startsWith('movie_chunk_')) {
        const idx = parseInt(key.replace('movie_chunk_', ''), 10);
        if (!isNaN(idx) && idx > maxMovieIndex) maxMovieIndex = idx;
      } else if (key.startsWith('series_chunk_')) {
        const idx = parseInt(key.replace('series_chunk_', ''), 10);
        if (!isNaN(idx) && idx > maxSeriesIndex) maxSeriesIndex = idx;
      }
    }
  }

  const fetchedChunks: Record<string, { id: string, items: Record<string, Content>, isNew: boolean, refSize: number }> = {};
  
  const getChunkData = async (chunkId: string) => {
    if (fetchedChunks[chunkId]) return fetchedChunks[chunkId];
    const docSnap = await getDoc(doc(db, 'content_chunks', chunkId));
    if (docSnap.exists()) {
      const items = docSnap.data().items || {};
      fetchedChunks[chunkId] = { id: chunkId, items, isNew: false, refSize: Object.keys(items).length };
    } else {
      fetchedChunks[chunkId] = { id: chunkId, items: {}, isNew: true, refSize: 0 };
    }
    return fetchedChunks[chunkId];
  };

  const chunkUpdatesMap = new Map<string, Record<string, any>>();

  for (const { content, rawType, chunkId } of contents) {
    const expectedPrefix = rawType === 'movie' ? 'movie_chunk_' : 'series_chunk_';
    const maxSize = expectedPrefix === 'movie_chunk_' ? CONTENT_CHUNK_MOVIE_SIZE : CONTENT_CHUNK_SERIES_SIZE;

    // 1. Try to update existing via chunkId
    if (chunkId) {
      const u = chunkUpdatesMap.get(chunkId) || {};
      u[content.id] = content;
      chunkUpdatesMap.set(chunkId, u);
      continue;
    }

    // 2. Fallback to add to latest
    let targetChunkId = '';
    let maxIdx = expectedPrefix === 'movie_chunk_' ? maxMovieIndex : maxSeriesIndex;
    let foundSpace = false;

    if (maxIdx >= 0) {
       targetChunkId = `${expectedPrefix}${maxIdx}`;
       const cData = await getChunkData(targetChunkId);
       if (cData.items[content.id] || cData.refSize < maxSize) {
          if (!cData.items[content.id]) cData.refSize++;
          cData.items[content.id] = content;
          const u = chunkUpdatesMap.get(targetChunkId) || {};
          u[content.id] = content;
          chunkUpdatesMap.set(targetChunkId, u);
          foundSpace = true;
       }
    }

    if (!foundSpace) {
       // Create new chunk
       maxIdx = Math.max(0, maxIdx + 1);
       if (expectedPrefix === 'movie_chunk_') maxMovieIndex = maxIdx;
       else maxSeriesIndex = maxIdx;
       
       targetChunkId = `${expectedPrefix}${maxIdx}`;
       
       fetchedChunks[targetChunkId] = { id: targetChunkId, items: { [content.id]: content }, isNew: true, refSize: 1 };
       const u = chunkUpdatesMap.get(targetChunkId) || {};
       u[content.id] = content;
       chunkUpdatesMap.set(targetChunkId, u);
    }
  }

  const updatedChunkIdsArr = Array.from(chunkUpdatesMap.keys());
  for (const [chunkId, items] of chunkUpdatesMap.entries()) {
      batch.set(doc(db, 'content_chunks', chunkId), { items }, { merge: true });
  }

  if (updatedChunkIdsArr.length > 0) {
     const sizes: Record<string, number> = {};
     updatedChunkIdsArr.forEach(id => {
         if (fetchedChunks[id]) sizes[id] = fetchedChunks[id].refSize;
     });
     registerChunkUpdates(updatedChunkIdsArr, batch, sizes);
     await batch.commit();
  }

  await autoRebalanceChunks();
}

/**
 * Checks and balances content chunks LOCALLY in safeStorage before syncing to Firestore.
 * Ensures movie chunks have at most CONTENT_CHUNK_MOVIE_SIZE (500) items and series chunks have at most CONTENT_CHUNK_SERIES_SIZE (200) items.
 * If overflow is found, moves extra items locally into subsequent chunks (movie_chunk_1, series_chunk_1, etc.)
 * and registers all affected chunk IDs into pending_chunk_updates.
 * Returns { rebalanced: boolean, rebalancedCount: number, affectedChunkIds: string[] }
 */
export function rebalanceLocalChunks(): { rebalanced: boolean; rebalancedCount: number; affectedChunkIds: string[] } {
  let rebalancedCount = 0;
  const affectedChunkIds = new Set<string>();

  const processType = (prefix: string, maxSize: number) => {
    // 1. Gather all local chunks for this prefix
    const chunksMap = new Map<number, { id: string; items: Record<string, any> }>();
    for (let i = 0; i < 50; i++) {
      const cid = `${prefix}${i}`;
      const chunkStr = safeStorage.getItem(`content_chunk_${cid}`) || safeStorage.getItem(cid);
      if (chunkStr) {
        try {
          const items = JSON.parse(chunkStr);
          chunksMap.set(i, { id: cid, items: { ...items } });
        } catch(e) {}
      }
    }

    const indices = Array.from(chunksMap.keys()).sort((a, b) => a - b);
    if (indices.length === 0) return;

    let maxIdx = Math.max(...indices);

    for (let i = 0; i <= maxIdx; i++) {
      const currentChunk = chunksMap.get(i);
      if (!currentChunk) continue;

      const itemEntries = Object.entries(currentChunk.items);
      if (itemEntries.length > maxSize) {
        // Keep first maxSize items, move extra items to next chunk
        const keepEntries = itemEntries.slice(0, maxSize);
        const overflowEntries = itemEntries.slice(maxSize);

        currentChunk.items = Object.fromEntries(keepEntries);
        rebalancedCount += overflowEntries.length;
        affectedChunkIds.add(currentChunk.id);

        const nextIdx = i + 1;
        let nextChunk = chunksMap.get(nextIdx);
        if (!nextChunk) {
          nextChunk = { id: `${prefix}${nextIdx}`, items: {} };
          chunksMap.set(nextIdx, nextChunk);
          if (nextIdx > maxIdx) maxIdx = nextIdx;
        }

        overflowEntries.forEach(([itemId, val]) => {
          nextChunk!.items[itemId] = val;
        });
        affectedChunkIds.add(nextChunk.id);

        // Save immediately to local storage
        safeStorage.setItem(`content_chunk_${currentChunk.id}`, JSON.stringify(currentChunk.items));
        safeStorage.setItem(`content_chunk_${nextChunk.id}`, JSON.stringify(nextChunk.items));
      }
    }
  };

  processType('movie_chunk_', CONTENT_CHUNK_MOVIE_SIZE);
  processType('series_chunk_', CONTENT_CHUNK_SERIES_SIZE);

  if (affectedChunkIds.size > 0) {
    // Register affected chunks in pending_chunk_updates
    const pendingStr = safeStorage.getItem('pending_chunk_updates') || '[]';
    let pendingSet: Set<string>;
    try {
      pendingSet = new Set<string>(JSON.parse(pendingStr));
    } catch(e) {
      pendingSet = new Set<string>();
    }
    affectedChunkIds.forEach(id => pendingSet.add(id));
    safeStorage.setItem('pending_chunk_updates', JSON.stringify(Array.from(pendingSet)));

    // Update chunk_meta_versions
    const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
    let localMeta: Record<string, any> = {};
    try { localMeta = JSON.parse(localMetaString); } catch(e) {}
    const now = Date.now();
    affectedChunkIds.forEach(cid => {
      const chunkStr = safeStorage.getItem(`content_chunk_${cid}`) || '{}';
      try {
        const items = JSON.parse(chunkStr);
        localMeta[cid] = { version: now, count: Object.keys(items).length };
      } catch(e) {}
    });
    safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
  }

  return {
    rebalanced: rebalancedCount > 0,
    rebalancedCount,
    affectedChunkIds: Array.from(affectedChunkIds)
  };
}

/**
 * Automatically reconfigures content chunks when syncing/saving to Firestore.
 * Performs balancing locally first, and only writes to Firestore if rebalancing occurred.
 */
export async function autoRebalanceChunks(): Promise<{ rebalancedCount: number }> {
  try {
    const { rebalanced, rebalancedCount, affectedChunkIds } = rebalanceLocalChunks();
    if (!rebalanced || affectedChunkIds.length === 0) {
      return { rebalancedCount: 0 };
    }

    const batch = writeBatch(db);
    const updatedMeta: Record<string, { version: number; count: number }> = {};
    const now = Date.now();

    for (const cid of affectedChunkIds) {
      const chunkStr = safeStorage.getItem(`content_chunk_${cid}`) || '{}';
      try {
        const items = JSON.parse(chunkStr);
        batch.set(doc(db, 'content_chunks', cid), { items, updatedAt: serverTimestamp() }, { merge: true });
        updatedMeta[cid] = { version: now, count: Object.keys(items).length };
      } catch(e) {}
    }

    if (Object.keys(updatedMeta).length > 0) {
      batch.set(doc(db, 'chunk_meta', 'versions'), updatedMeta, { merge: true });
      await batch.commit();
    }

    return { rebalancedCount };
  } catch (err) {
    console.error('Error in autoRebalanceChunks:', err);
    return { rebalancedCount: 0 };
  }
}

/**
 * Locates the chunk ID for a given content item from local storage
 */
export function findLocalChunkForContent(contentId: string): string | null {
  for (let i = 0; i < 50; i++) {
    const mStr = safeStorage.getItem(`content_chunk_movie_chunk_${i}`);
    if (mStr && mStr.includes(`"${contentId}"`)) {
      try {
        const items = JSON.parse(mStr);
        if (items[contentId]) return `movie_chunk_${i}`;
      } catch(e) {}
    }
    const sStr = safeStorage.getItem(`content_chunk_series_chunk_${i}`);
    if (sStr && sStr.includes(`"${contentId}"`)) {
      try {
        const items = JSON.parse(sStr);
        if (items[contentId]) return `series_chunk_${i}`;
      } catch(e) {}
    }
  }
  return null;
}

/**
 * Updates specific fields for multiple content items in their respective chunks
 */
export async function updateContentFieldsInChunks(updates: { id: string, chunkId?: string, fields?: any, [key: string]: any }[]): Promise<void> {
  const resolvedUpdates = updates.map(u => ({
    ...u,
    chunkId: u.chunkId || findLocalChunkForContent(u.id) || undefined
  }));

  const explicitUpdates = resolvedUpdates.filter(u => u.chunkId);
  const unknownUpdates = resolvedUpdates.filter(u => !u.chunkId);
  
  let chunksSnap: any = null;
  if (unknownUpdates.length > 0) {
      const metaDoc = await getDoc(doc(db, 'chunk_meta', 'versions'));
      const metaData = metaDoc.exists() ? metaDoc.data() : {};
      const knownChunkIds = Object.keys(metaData).filter(k => k.startsWith('movie_chunk_') || k.startsWith('series_chunk_') || k.startsWith('content_chunk_'));
      
      for (const updateObj of unknownUpdates) {
          let found = false;
          for (const cid of knownChunkIds) {
              const chunkDoc = await getDoc(doc(db, 'content_chunks', cid));
              if (chunkDoc.exists()) {
                  const items = chunkDoc.data().items || {};
                  if (items[updateObj.id]) {
                      updateObj.chunkId = cid;
                      found = true;
                      break;
                  }
              }
          }
          if (found) explicitUpdates.push(updateObj);
      }
  }
  const chunkUpdatesMap = new Map<string, Record<string, any>>();
  
  const aggregateUpdate = (chunkId: string, contentId: string, updateObj: any) => {
      const docUpdates = chunkUpdatesMap.get(chunkId) || {};
      const fieldsObj = updateObj.fields || updateObj;
      for (const [key, value] of Object.entries(fieldsObj)) {
          if (key !== 'id' && key !== 'chunkId' && key !== 'fields') {
              const shortKey = FIELD_MAP[key] || key;
              docUpdates[`items.${contentId}.${shortKey}`] = value;
          }
      }
      chunkUpdatesMap.set(chunkId, docUpdates);
  };

  for (const updateObj of explicitUpdates) {
      aggregateUpdate(updateObj.chunkId!, updateObj.id, updateObj);
  }

  // Fallback has been moved to explicitUpdates above, no need to loop unknownUpdates with chunksSnap


  let batches = [writeBatch(db)];
  let operationCount = 0;
  const chunkUpdatesByBatch: Set<string>[] = [new Set()];

  for (const [chunkId, docUpdates] of chunkUpdatesMap.entries()) {
      if (operationCount >= 490) {
          batches.push(writeBatch(db));
          chunkUpdatesByBatch.push(new Set());
          operationCount = 0;
      }
      
      batches[batches.length - 1].update(doc(db, 'content_chunks', chunkId), docUpdates);
      chunkUpdatesByBatch[batches.length - 1].add(chunkId);
      operationCount++;
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
export async function deleteContentFromChunk(contentId: string, chunkId?: string): Promise<void> {
  return deleteContentsFromChunks([{ id: contentId, chunkId }]);
}

/**
 * Deletes multiple content items from chunks efficiently
 */
export async function deleteContentsFromChunks(itemsToRemove: {id: string, chunkId?: string}[]): Promise<void> {
  const resolvedRemovals = itemsToRemove.map(i => ({
    ...i,
    chunkId: i.chunkId || findLocalChunkForContent(i.id) || undefined
  }));

  const explicitRemovals = resolvedRemovals.filter(i => i.chunkId);
  const unknownRemovals = resolvedRemovals.filter(i => !i.chunkId);

  let chunksSnap: any = null;
  if (unknownRemovals.length > 0) {
     chunksSnap = await getDocs(collection(db, 'content_chunks'));
  }
  
  const chunkDeletesMap = new Map<string, Record<string, any>>();

  const aggregateDelete = (chunkId: string, contentId: string) => {
      const docUpdates = chunkDeletesMap.get(chunkId) || {};
      docUpdates[`items.${contentId}`] = deleteField();
      chunkDeletesMap.set(chunkId, docUpdates);
  };

  for (const item of explicitRemovals) {
      aggregateDelete(item.chunkId!, item.id);
  }

  if (chunksSnap) {
      for (const chunkDoc of chunksSnap.docs) {
        const items = chunkDoc.data().items || {};
        for (const item of unknownRemovals) {
          if (items[item.id]) {
            aggregateDelete(chunkDoc.id, item.id);
          }
        }
      }
  }

  let batches = [writeBatch(db)];
  let operationCount = 0;
  const chunkUpdatesByBatch: Set<string>[] = [new Set()];

  for (const [chunkId, docUpdates] of chunkDeletesMap.entries()) {
      if (operationCount >= 490) {
          batches.push(writeBatch(db));
          chunkUpdatesByBatch.push(new Set());
          operationCount = 0;
      }
      batches[batches.length - 1].update(doc(db, 'content_chunks', chunkId), docUpdates);
      chunkUpdatesByBatch[batches.length - 1].add(chunkId);
      operationCount++;
  }

  for (let i = 0; i < batches.length; i++) {
    if (chunkUpdatesByBatch[i].size > 0) {
      registerChunkUpdates(Array.from(chunkUpdatesByBatch[i]), batches[i]);
    }
  }

  await Promise.all(batches.map(b => b.commit()));
}

export async function getContentFromChunks(contentId: string): Promise<Content | null> {
  const localChunkId = findLocalChunkForContent(contentId);
  if (localChunkId) {
    const chunkStr = safeStorage.getItem(`content_chunk_${localChunkId}`) || safeStorage.getItem(localChunkId);
    if (chunkStr) {
      try {
        const items = JSON.parse(chunkStr);
        if (items[contentId]) {
          return expandContent({ ...items[contentId], id: contentId }, localChunkId);
        }
      } catch(e) {}
    }
  }

  const chunksSnap = await getDocs(collection(db, 'content_chunks'));
  
  for (const chunkDoc of chunksSnap.docs) {
    const items = chunkDoc.data().items || {};
    if (items[contentId]) {
      return expandContent({ ...items[contentId], id: contentId }, chunkDoc.id);
    }
  }
  return null;
}

/**
 * Scans all chunks in Firestore and ensures chunk_meta/versions is up to date
 */
export async function repairChunkMetadata(): Promise<{ repairedContent: number }> {
  await autoRebalanceChunks();
  const batch = writeBatch(db);
  const now = Date.now();

  // 1. Repair content_chunks
  const contentSnap = await getDocs(collection(db, 'content_chunks'));
  const contentVersions: Record<string, any> = {};
  contentSnap.docs.forEach(d => {
    const items = d.data().items || {};
    contentVersions[d.id] = { version: now, count: Object.keys(items).length };
  });
  batch.set(doc(db, 'chunk_meta', 'versions'), contentVersions, { merge: true });

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
    const orderA = a.order ?? Number.MIN_SAFE_INTEGER;
    const orderB = b.order ?? Number.MIN_SAFE_INTEGER;
    if (orderA !== orderB) return orderB - orderA;
    
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
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
  const metaUpdates: Record<string, any> = {};
  const now = Date.now();
  Object.entries(chunkDocs).forEach(([id, itemsObj]) => {
    metaUpdates[id] = { version: now, count: Object.keys(itemsObj as object).length };
  });
  batches[batches.length - 1].set(doc(db, 'chunk_meta', 'versions'), metaUpdates);

  // Execute all batches
  await Promise.all(batches.map(b => b.commit()));

  return Object.keys(chunkDocs).length;
}

export async function fetchReviewsFromChunks(forceRefresh = false, syncWithFirestore = false): Promise<any[]> {
  // Requirement: "Automatically load reviews json from home page for all users even for admin"
  // Requirement: "Don't directly refersh by Firestore, when user submit review then sync it with Firestore and save to local storage to show"
  // Requirement: "after daily auto GitHub sync it will present to all users"

  const cachedData = safeStorage.getItem('cached_reviews_data');
  const cachedVersion = safeStorage.getItem('cached_review_version');

  // If we are NOT syncing with Firestore, we should use the staticReviews + any recently submitted local reviews if possible,
  // or just staticReviews if we want a clean state.
  if (!syncWithFirestore) {
    if (cachedData && !forceRefresh) {
      try {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {}
    }
    
    // Default fallback to static JSON for all users (including admins)
    return staticReviews;
  }

  // Live Firestore fetch (triggered ONLY after a new review is submitted or explicit admin action)
  try {
    const meta = await getChunkMeta(forceRefresh);
    const serverVersion = meta.reviews?.version?.toString() || '0';
    
    // If version matches and we're not forcing, return cache
    if (!forceRefresh && cachedVersion === serverVersion && cachedVersion !== '0' && cachedVersion !== 'static' && cachedData) {
      try {
        return JSON.parse(cachedData);
      } catch (e) {}
    }

    let allReviews: any[] = [];
    const mainDoc = await runWithNetwork(() => getDoc(doc(db, 'review_chunks', 'main')));
    if (mainDoc.exists()) {
      const items = mainDoc.data().items || {};
      allReviews = Object.values(items);
    } else {
      allReviews = [...staticReviews];
    }

    // Sort by date descending
    allReviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    safeStorage.setItem('cached_reviews_data', JSON.stringify(allReviews));
    safeStorage.setItem('cached_review_version', serverVersion === '0' ? Date.now().toString() : serverVersion);
    
    return allReviews;
  } catch (e) {
    console.error("Error fetching review chunks from Firestore:", e);
    return staticReviews;
  }
}

export async function saveReviewToChunk(review: any): Promise<void> {
  const batch = writeBatch(db);
  const now = Date.now();
  
  // Clean review object of undefined values to prevent Firestore errors
  const cleanedReview: any = {};
  Object.entries(review).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      cleanedReview[key] = value;
    }
  });

  // For simplicity and following "chunk combination of all reviews", 
  // we'll use a single chunk named 'main' for now.
  const chunkRef = doc(db, 'review_chunks', 'main');
  
  // Use nested object with merge: true to update specific item in the map
  batch.set(chunkRef, { 
    items: { 
      [cleanedReview.id]: cleanedReview 
    } 
  }, { merge: true });
  
  // Update version
  const metaRef = doc(db, 'chunk_meta', 'versions');
  batch.set(metaRef, { reviews: { version: now } }, { merge: true });
  
  await batch.commit();
  clearChunkMetaCache();
}

export async function deleteReviewFromChunk(reviewId: string): Promise<void> {
  const batch = writeBatch(db);
  const now = Date.now();
  
  const chunkRef = doc(db, 'review_chunks', 'main');
  
  // For deletion in a map with merge: true, we must use dot notation with update() 
  // or a special deleteField() in set(). 
  // Using update() is safer if we know the doc exists, but here we'll use set with nested deleteField.
  batch.set(chunkRef, {
    items: {
      [reviewId]: deleteField()
    }
  }, { merge: true });
  
  // Update version
  const metaRef = doc(db, 'chunk_meta', 'versions');
  batch.set(metaRef, { reviews: { version: now } }, { merge: true });
  
  await batch.commit();
  clearChunkMetaCache();
}

