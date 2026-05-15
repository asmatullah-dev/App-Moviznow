import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { safeStorage } from './safeStorage';

let chunkMetaPromise: Promise<Record<string, any>> | null = null;
let memoryCache: Record<string, any> | null = null;

const shouldFetchMeta = () => {
  const now = Date.now();
  // PKT is UTC+5. Shift back by 9 hours to align the daily update cycle with 9 AM PKT.
  const shiftedTime = new Date(now + (5 - 9) * 60 * 60 * 1000);
  const checkPeriod = `${shiftedTime.getUTCFullYear()}-${shiftedTime.getUTCMonth() + 1}-${shiftedTime.getUTCDate()}`;

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

        const nowInternal = Date.now();
        const shiftedTimeInternal = new Date(nowInternal + (5 - 9) * 60 * 60 * 1000);
        const periodInternal = `${shiftedTimeInternal.getUTCFullYear()}-${shiftedTimeInternal.getUTCMonth() + 1}-${shiftedTimeInternal.getUTCDate()}`;
        safeStorage.setItem('last_chunk_meta_period', periodInternal);

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

export const updateUserChunkMeta = async (userIds: string[]) => {
  const { doc, getDoc, setDoc } = await import('firebase/firestore');
  const metaRef = doc(db, 'chunk_meta', 'versions');
  const snap = await getDoc(metaRef);
  const data = snap.exists() ? snap.data() : { users: {} };
  const users = data.users || {};
  
  const now = Date.now();
  userIds.forEach(uid => {
    users[uid] = now;
  });
  
  await setDoc(metaRef, { ...data, users }, { merge: true });
  
  // Clear memory cache to ensure next read gets fresh data
  memoryCache = null;
  safeStorage.removeItem('cached_chunk_meta_doc');
};
