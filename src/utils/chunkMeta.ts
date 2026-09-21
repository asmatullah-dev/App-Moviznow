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
    const timePart = trimmed.includes('_') ? trimmed.split('_')[0] : trimmed;
    const parsedTimePart = Date.parse(timePart);
    if (!isNaN(parsedTimePart)) {
      return parsedTimePart;
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

const FIFTEEN_SECONDS_MS = 15 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export const getSavedChunkMeta = (): Record<string, any> | null => {
  if (memoryCache && typeof memoryCache === 'object' && Object.keys(memoryCache).length > 0) {
    return memoryCache;
  }
  const cachedStr = safeStorage.getItem('cached_chunk_meta_doc');
  if (cachedStr && cachedStr !== '{}' && cachedStr !== 'null') {
    try {
      const parsed = JSON.parse(cachedStr);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        memoryCache = parsed;
        return parsed;
      }
    } catch (e) {}
  }
  return null;
};

const shouldFetchMeta = () => {
  const saved = getSavedChunkMeta();
  if (!saved) {
    return true;
  }
  const contentCache = safeStorage.getItem('content_cache');
  if (!contentCache || contentCache === '[]') {
    return true;
  }

  const now = Date.now();
  const lastFetchTimeStr = safeStorage.getItem('last_chunk_meta_fetch_time');
  const lastFetchTime = lastFetchTimeStr ? parseInt(lastFetchTimeStr, 10) : 0;
  const effectiveLastFetch = Math.max(lastFetchTimeMs, lastFetchTime);
  
  // If fetched within 15 seconds, return false (cooldown)
  if (effectiveLastFetch > 0 && (now - effectiveLastFetch < FIFTEEN_SECONDS_MS)) {
    return false;
  }

  // If older than 6 hours, fetch latest chunk meta
  if (now - effectiveLastFetch > SIX_HOURS_MS) {
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

/**
 * Gets chunk_meta versions.
 * If forceRefresh is requested, bypasses all cooldowns and fetches directly from server.
 * If not forcing refresh, checks if 15 seconds have passed since the last get chunk meta.
 */
export const getChunkMeta = async (forceRefresh = false): Promise<Record<string, any>> => {
  const nowMs = Date.now();
  const lastFetchTimeStr = safeStorage.getItem('last_chunk_meta_fetch_time');
  const storedFetchTime = lastFetchTimeStr ? parseInt(lastFetchTimeStr, 10) : 0;
  const effectiveLastFetch = Math.max(lastFetchTimeMs, storedFetchTime);

  const savedMeta = getSavedChunkMeta();
  const timeSinceLastFetch = nowMs - effectiveLastFetch;
  const isWithin15Sec = effectiveLastFetch > 0 && timeSinceLastFetch < FIFTEEN_SECONDS_MS;

  // RULE: 15 sec cooldown for background checks. If forceRefresh is explicitly requested, bypass all cooldowns.
  if (!forceRefresh && savedMeta && isWithin15Sec) {
    return savedMeta;
  }

  // If not forcing refresh, check if savedMeta is still valid under standard policy (within 15s / 6 hours / daily check)
  if (!forceRefresh && savedMeta && !shouldFetchMeta()) {
    return savedMeta;
  }

  // If offline, never attempt network fetch - immediately return saved cache
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return savedMeta || {};
  }

  // Deduplicate concurrent in-flight fetches unless forceRefresh is explicitly requested
  if (chunkMetaPromise && !forceRefresh) {
    return chunkMetaPromise;
  }

  // Fetch from server: either first load (no saved meta) or 15s cooldown has expired or forceRefresh requested
  // Race with 2500ms timeout so slow internet or Firestore stalls never block startup
  const networkDocPromise = runWithNetwork(() => getDoc(doc(db, 'chunk_meta', 'versions')))
    .then(snap => snap.exists() ? (snap.data() || {}) : {});

  const fetchPromise = new Promise<Record<string, any>>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.warn("[chunkMeta] Server fetch exceeded 2500ms, immediately returning saved cache");
        resolve(savedMeta || {});
      }
    }, 2500);

    networkDocPromise
      .then(data => {
        const now = Date.now();
        lastFetchTimeMs = now;
        memoryCache = data;
        safeStorage.setItem('cached_chunk_meta_doc', JSON.stringify(data));
        safeStorage.setItem('last_chunk_meta_fetch_time', now.toString());

        const shiftedTimeInternal = new Date(now + (5 - 7) * 60 * 60 * 1000);
        const periodInternal = `${shiftedTimeInternal.getUTCFullYear()}-${shiftedTimeInternal.getUTCMonth() + 1}-${shiftedTimeInternal.getUTCDate()}`;
        safeStorage.setItem('last_chunk_meta_period', periodInternal);

        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(data);
        }
      })
      .catch(err => {
        console.error("Error fetching chunk_meta from server:", err);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          const fallback = getSavedChunkMeta();
          resolve(fallback || {});
        }
      })
      .finally(() => {
        if (chunkMetaPromise === fetchPromise) {
          chunkMetaPromise = null;
        }
      });
  });

  chunkMetaPromise = fetchPromise;
  return fetchPromise;
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
