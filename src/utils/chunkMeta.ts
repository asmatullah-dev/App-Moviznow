import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { safeStorage } from './safeStorage';

let chunkMetaPromise: Promise<Record<string, any>> | null = null;
let memoryCache: Record<string, any> | null = null;

const shouldFetchMeta = () => {
  let isAdmin = false;
  try {
    const profileStr = safeStorage.getItem('profile_cache');
    if (profileStr) {
      const profile = JSON.parse(profileStr);
      isAdmin = ['owner', 'admin', 'content_manager', 'editor', 'manager', 'user_manager'].includes(profile.role);
    }
  } catch(e) {}
  
  if (isAdmin) return true;
  
  const now = Date.now();
  const pktTimeNow = new Date(now + (5 * 60 * 60 * 1000));
  const pktDateNowString = `${pktTimeNow.getUTCFullYear()}-${pktTimeNow.getUTCMonth() + 1}-${pktTimeNow.getUTCDate()}`;

  const isPast9AMPKT = pktTimeNow.getUTCHours() >= 9;
  
  const lastFetchStr = safeStorage.getItem('last_chunk_meta_fetch_time');
  if (!lastFetchStr) return true;

  const lastFetch = new Date(parseInt(lastFetchStr, 10));
  const pktTimeLastFetch = new Date(lastFetch.getTime() + (5 * 60 * 60 * 1000));
  const pktDateLastFetchString = `${pktTimeLastFetch.getUTCFullYear()}-${pktTimeLastFetch.getUTCMonth() + 1}-${pktTimeLastFetch.getUTCDate()}`;

  // If we haven't fetched today in PKT, and it's past 9AM PKT, or if we fetched today before 9AM but it's now past 9AM...
  // Simplify: Check the last fetch period string
  const checkPeriod = isPast9AMPKT ? pktDateNowString : `before-9am-${pktDateNowString}`;
  const lastCheckPeriod = safeStorage.getItem('last_chunk_meta_period');

  if (lastCheckPeriod !== checkPeriod) {
     return true;
  }
  
  return false;
};

let lastForceFetchTime = 0;

export const getChunkMeta = async (forceRefresh = false) => {
  const nowMs = Date.now();
  // If forceRefresh is requested but we just fetched within exactly 2000ms, use memory cache
  const effectiveForceRefresh = forceRefresh && (nowMs - lastForceFetchTime > 2000);

  if (memoryCache && !effectiveForceRefresh) return memoryCache;

  const requiresFetch = effectiveForceRefresh || shouldFetchMeta();
  
  if (!requiresFetch) {
    const cachedStr = safeStorage.getItem('cached_chunk_meta_doc');
    if (cachedStr) {
      try {
        memoryCache = JSON.parse(cachedStr);
        return memoryCache;
      } catch(e) {}
    }
  }

  // Reuse inflight promise if it exists to prevent multiple concurrent reads
  if (chunkMetaPromise) {
     return chunkMetaPromise;
  }

  if (!chunkMetaPromise || effectiveForceRefresh) {
    if (effectiveForceRefresh) lastForceFetchTime = nowMs;
    chunkMetaPromise = getDoc(doc(db, 'chunk_meta', 'versions'))
      .then(snap => snap.exists() ? snap.data() : {})
      .then(data => {
        memoryCache = data;
        safeStorage.setItem('cached_chunk_meta_doc', JSON.stringify(data));
        safeStorage.setItem('last_chunk_meta_fetch_time', Date.now().toString());

        const now = Date.now();
        const pktTimeNow = new Date(now + (5 * 60 * 60 * 1000));
        const pktDateNowString = `${pktTimeNow.getUTCFullYear()}-${pktTimeNow.getUTCMonth() + 1}-${pktTimeNow.getUTCDate()}`;
        const isPast9AMPKT = pktTimeNow.getUTCHours() >= 9;
        const checkPeriod = isPast9AMPKT ? pktDateNowString : `before-9am-${pktDateNowString}`;
        safeStorage.setItem('last_chunk_meta_period', checkPeriod);

        chunkMetaPromise = null; // Clear the inflight promise
        return data;
      })
      .catch(err => {
        console.error("Error fetching chunk_meta:", err);
        chunkMetaPromise = null;
        return {};
      });
  }
  return chunkMetaPromise;
};
