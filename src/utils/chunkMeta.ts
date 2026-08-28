import { doc, getDoc } from 'firebase/firestore';
import { db, runWithNetwork } from '../firebase';
import { safeStorage } from './safeStorage';

/**
 * Standard UTC+5 (PKT) version generator.
 * Returns ISO 8601 timestamp string with +05:00 offset: e.g. "2026-08-27T17:42:30.123+05:00"
 */
export const getUtcVersion = (date?: Date | number | string): string => {
  const getPktString = (ms: number) => {
    const pktDate = new Date(ms + 5 * 60 * 60 * 1000);
    return pktDate.toISOString().replace('Z', '+05:00');
  };

  if (!date) return getPktString(Date.now());
  if (typeof date === 'string') {
    const ms = parseVersionTime(date);
    return ms > 0 ? getPktString(ms) : getPktString(Date.now());
  }
  return getPktString(new Date(date).getTime());
};

/**
 * Safely parses any version representation into epoch milliseconds.
 * Supports ISO strings ("2026-08-27T..."), numeric timestamps (1740683050123),
 * objects with updatedAt or version fields, and deletion markers (-1).
 */
export const parseVersionTime = (val: any): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'object') {
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (val.seconds !== undefined) return val.seconds * 1000 + (val.nanoseconds || 0) / 1000000;
    return parseVersionTime(val.updatedAt || val.version || val.updated_at || 0);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || trimmed === '0') return 0;
    if (trimmed === '-1') return -1;
    // Check if it's a numeric string representation of epoch timestamp (12-14 digits)
    if (/^\d{12,14}$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) {
      return parsed;
    }
    const num = parseInt(trimmed, 10);
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

/**
 * Generates a UTC time version that is guaranteed to be strictly newer than previousVersion.
 */
export const getNewerUtcVersion = (previousVersion?: any): string => {
  const nowMs = Date.now();
  const getPktString = (ms: number) => {
    const pktDate = new Date(ms + 5 * 60 * 60 * 1000);
    return pktDate.toISOString().replace('Z', '+05:00');
  };

  if (previousVersion) {
    const prevMs = parseVersionTime(previousVersion);
    if (prevMs >= nowMs) {
      return getPktString(prevMs + 1000);
    }
  }
  return getPktString(nowMs);
};

/**
 * Checks if incomingVersion is strictly newer than currentVersion.
 */
export const isVersionNewer = (incoming: any, current: any): boolean => {
  return parseVersionTime(incoming) > parseVersionTime(current);
};

/**
 * Standard chunk_meta version object containing updatedAt in PKT ISO format.
 */
export const createVersionMeta = (extra: Record<string, any> = {}, prevVersion?: any) => {
  const utcNow = getNewerUtcVersion(prevVersion);
  return {
    updatedAt: utcNow,
    ...extra,
  };
};

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

  // If forceRefresh is requested, bypass the 90-second and memory caches completely
  const actualForce = forceRefresh;

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
