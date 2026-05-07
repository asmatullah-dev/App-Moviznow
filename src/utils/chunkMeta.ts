import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { safeStorage } from './safeStorage';

let chunkMetaPromise: Promise<Record<string, any>> | null = null;
let memoryCache: Record<string, any> | null = null;

const shouldFetchMeta = () => {
  let isAdmin = false;
  try {
    const profileStr = localStorage.getItem('authContext_profile');
    if (profileStr) {
      const profile = JSON.parse(profileStr);
      isAdmin = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile.role);
    }
  } catch(e) {}
  
  if (isAdmin) return true;
  
  const lastFetchStr = safeStorage.getItem('last_chunk_meta_fetch_time');
  if (!lastFetchStr) return true;
  
  const lastFetch = new Date(parseInt(lastFetchStr, 10));
  const now = new Date();
  
  const nineAMToday = new Date(now);
  nineAMToday.setHours(9, 0, 0, 0);

  // If last fetch was before 9 AM today, and it is now past 9 AM, fetch again
  if (lastFetch < nineAMToday && now >= nineAMToday) {
    return true;
  }
  
  return false;
};

export const getChunkMeta = async (forceRefresh = false) => {
  if (memoryCache && !forceRefresh) return memoryCache;

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

  if (!chunkMetaPromise || forceRefresh) {
    chunkMetaPromise = getDoc(doc(db, 'chunk_meta', 'versions'))
      .then(snap => snap.exists() ? snap.data() : {})
      .then(data => {
        memoryCache = data;
        safeStorage.setItem('cached_chunk_meta_doc', JSON.stringify(data));
        safeStorage.setItem('last_chunk_meta_fetch_time', Date.now().toString());
        return data;
      })
      .catch(err => {
        console.error("Error fetching chunk_meta:", err);
        return {};
      });
  }
  return chunkMetaPromise;
};
