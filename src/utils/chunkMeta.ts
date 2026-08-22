import { doc, getDoc } from 'firebase/firestore';
import { db, runWithNetwork } from '../firebase';
import { safeStorage } from './safeStorage';

let chunkMetaPromise: Promise<Record<string, any>> | null = null;
let memoryCache: Record<string, any> | null = null;

const shouldFetchMeta = () => {
  const cachedStr = safeStorage.getItem('cached_chunk_meta_doc');
  if (!cachedStr || cachedStr === '{}') {
    return true;
  }
  const contentCache = safeStorage.getItem('content_cache');
  if (!contentCache || contentCache === '[]') {
    return true;
  }

  const now = Date.now();
  // PKT is UTC+5. Shift back by 7 hours to align the daily update cycle with 7 AM PKT.
  const shiftedTime = new Date(now + (5 - 7) * 60 * 60 * 1000);
  const checkPeriod = `${shiftedTime.getUTCFullYear()}-${shiftedTime.getUTCMonth() + 1}-${shiftedTime.getUTCDate()}`;

  const lastCheckPeriod = safeStorage.getItem('last_chunk_meta_period');
  if (lastCheckPeriod !== checkPeriod) {
     return true;
  }
  
  return false;
};

export const getChunkMeta = async (forceRefresh = false) => {
  const nowMs = Date.now();

  if (forceRefresh) {
    chunkMetaPromise = null;
    memoryCache = null;
  } else if (memoryCache) {
    return memoryCache;
  }

  const requiresFetch = forceRefresh || shouldFetchMeta();
  
  if (!requiresFetch) {
    const cachedStr = safeStorage.getItem('cached_chunk_meta_doc');
    if (cachedStr) {
      try {
        memoryCache = JSON.parse(cachedStr);
        return memoryCache;
      } catch(e) {}
    }
  }

  if (chunkMetaPromise && !forceRefresh) {
     return chunkMetaPromise;
  }

  if (!chunkMetaPromise || forceRefresh) {
    chunkMetaPromise = runWithNetwork(() => getDoc(doc(db, 'chunk_meta', 'versions')))
      .then(snap => snap.exists() ? snap.data() : {})
      .then(data => {
        memoryCache = data;
        safeStorage.setItem('cached_chunk_meta_doc', JSON.stringify(data));
        safeStorage.setItem('last_chunk_meta_fetch_time', Date.now().toString());

        const nowInternal = Date.now();
        const shiftedTimeInternal = new Date(nowInternal + (5 - 7) * 60 * 60 * 1000);
        const periodInternal = `${shiftedTimeInternal.getUTCFullYear()}-${shiftedTimeInternal.getUTCMonth() + 1}-${shiftedTimeInternal.getUTCDate()}`;
        safeStorage.setItem('last_chunk_meta_period', periodInternal);
        
        chunkMetaPromise = null;
        return data;
      })
      .catch(err => {
        console.error("Error fetching chunk_meta:", err);
        chunkMetaPromise = null;
        return memoryCache || {};
      });
  }
  return chunkMetaPromise;
};

export const updateChunkMetaLocalCache = (updates: Record<string, any>) => {
  if (!memoryCache) {
    const cachedStr = safeStorage.getItem('cached_chunk_meta_doc');
    if (cachedStr) {
      try { memoryCache = JSON.parse(cachedStr); } catch(e) { memoryCache = {}; }
    } else {
      memoryCache = {};
    }
  }
  memoryCache = { ...memoryCache, ...updates };
  safeStorage.setItem('cached_chunk_meta_doc', JSON.stringify(memoryCache));
};

export const clearChunkMetaCache = () => {
  chunkMetaPromise = null;
  memoryCache = null;
  safeStorage.removeItem('cached_chunk_meta_doc');
  safeStorage.removeItem('last_chunk_meta_period');
};
