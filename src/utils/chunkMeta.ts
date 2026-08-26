import { doc, getDoc } from 'firebase/firestore';
import { db, runWithNetwork } from '../firebase';
import { safeStorage } from './safeStorage';

let chunkMetaPromise: Promise<Record<string, any>> | null = null;
let memoryCache: Record<string, any> | null = null;
let lastFetchTimeMs = 0;

const NINETY_SECONDS_MS = 90 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

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
  const lastFetchTimeStr = safeStorage.getItem('last_chunk_meta_fetch_time');
  const lastFetchTime = lastFetchTimeStr ? parseInt(lastFetchTimeStr, 10) : 0;
  
  // If fetched within 90 seconds, definitely do not fetch
  if (now - lastFetchTime < NINETY_SECONDS_MS) {
    return false;
  }

  // If older than 6 hours, fetch latest chunk meta
  if (now - lastFetchTime > SIX_HOURS_MS) {
    return true;
  }

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
  const lastFetchTimeStr = safeStorage.getItem('last_chunk_meta_fetch_time');
  const storedFetchTime = lastFetchTimeStr ? parseInt(lastFetchTimeStr, 10) : 0;
  const effectiveLastFetch = Math.max(lastFetchTimeMs, storedFetchTime);

  // Requirement: Keep chunkmeta in local cache for 90 sec to reuse without connecting again with network
  const isWithin90Sec = (nowMs - effectiveLastFetch) < NINETY_SECONDS_MS;

  // If we already have memoryCache or local storage cache within 90 seconds, return it immediately without network
  if (isWithin90Sec) {
    if (memoryCache) {
      return memoryCache;
    }
    const cachedStr = safeStorage.getItem('cached_chunk_meta_doc');
    if (cachedStr && cachedStr !== '{}') {
      try {
        memoryCache = JSON.parse(cachedStr);
        return memoryCache;
      } catch (e) {}
    }
  }

  // If forceRefresh is requested but we fetched within 90s, reuse the cache unless forced and >90s has elapsed
  const actualForce = forceRefresh && !isWithin90Sec;

  if (actualForce) {
    chunkMetaPromise = null;
    memoryCache = null;
  } else if (memoryCache && !chunkMetaPromise) {
    if (nowMs - effectiveLastFetch <= SIX_HOURS_MS) {
      return memoryCache;
    }
  }

  const requiresFetch = actualForce || shouldFetchMeta();
  
  if (!requiresFetch) {
    if (memoryCache) return memoryCache;
    const cachedStr = safeStorage.getItem('cached_chunk_meta_doc');
    if (cachedStr && cachedStr !== '{}') {
      try {
        memoryCache = JSON.parse(cachedStr);
        return memoryCache;
      } catch(e) {}
    }
    return memoryCache || {};
  }

  if (chunkMetaPromise) {
     return chunkMetaPromise;
  }

  chunkMetaPromise = runWithNetwork(() => getDoc(doc(db, 'chunk_meta', 'versions')))
    .then(snap => snap.exists() ? snap.data() : {})
    .then(data => {
      const now = Date.now();
      lastFetchTimeMs = now;
      memoryCache = data;
      safeStorage.setItem('cached_chunk_meta_doc', JSON.stringify(data));
      safeStorage.setItem('last_chunk_meta_fetch_time', now.toString());

      const shiftedTimeInternal = new Date(now + (5 - 7) * 60 * 60 * 1000);
      const periodInternal = `${shiftedTimeInternal.getUTCFullYear()}-${shiftedTimeInternal.getUTCMonth() + 1}-${shiftedTimeInternal.getUTCDate()}`;
      safeStorage.setItem('last_chunk_meta_period', periodInternal);
      
      chunkMetaPromise = null;
      return data;
    })
    .catch(err => {
      console.error("Error fetching chunk_meta:", err);
      chunkMetaPromise = null;
      const cachedStr = safeStorage.getItem('cached_chunk_meta_doc');
      if (cachedStr && cachedStr !== '{}') {
        try {
          memoryCache = JSON.parse(cachedStr);
          return memoryCache;
        } catch(e) {}
      }
      return memoryCache || {};
    });

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
  if (updates.users) {
    memoryCache.users = { ...(memoryCache.users || {}), ...updates.users };
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
