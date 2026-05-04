import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { safeStorage } from '../utils/safeStorage';
import { expandContent } from '../utils/chunkUtils';
import { useAuth } from './AuthContext';
import { useUsers } from './UsersContext';
import { Content, Genre, Language, Quality, Collection as AppCollection } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

interface ContentContextType {
  contentList: Content[];
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
  collections: AppCollection[];
  loading: boolean;
  isOffline: boolean;
  updateOrder: (updates: {id: string, order: number}[]) => Promise<void>;
  getContent: (id: string) => Promise<Content | null>;
  saveContent: (content: Content) => Promise<void>;
  deleteContent: (id: string, chunkId?: string) => Promise<void>;
  updateContentFields: (updates: { id: string, fields: Partial<Content>, chunkId?: string }[]) => Promise<void>;
  deleteMultipleContents: (items: { id: string, chunkId?: string }[]) => Promise<void>;
  updateAuxiliaryCollection: (type: 'genre' | 'language' | 'quality', items: any[]) => Promise<void>;
  addCollection: (collection: Omit<AppCollection, 'id'>) => Promise<void>;
  updateCollection: (id: string, updates: Partial<AppCollection>) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  addAuxiliaryItem: (type: 'genre' | 'language' | 'quality', item: any) => Promise<void>;
  updateAuxiliaryItem: (type: 'genre' | 'language' | 'quality', id: string, updates: any) => Promise<void>;
  deleteAuxiliaryItem: (type: 'genre' | 'language' | 'quality', id: string) => Promise<void>;
  finalizeChanges: () => Promise<void>;
  hasPendingChanges: boolean;
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const { profile, loading: authProfileLoading } = useAuth();
  const { users: allUsers } = useUsers();

  const [contentList, setContentList] = useState<Content[]>(() => {
    const cached = safeStorage.getItem('content_cache');
    return cached ? JSON.parse(cached) : [];
  });
  const [genres, setGenres] = useState<Genre[]>(() => {
    const cached = safeStorage.getItem('genres_cache');
    return cached ? JSON.parse(cached) : [];
  });
  const [languages, setLanguages] = useState<Language[]>(() => {
    const cached = safeStorage.getItem('languages_cache');
    return cached ? JSON.parse(cached) : [];
  });
  const [qualities, setQualities] = useState<Quality[]>(() => {
    const cached = safeStorage.getItem('qualities_cache');
    return cached ? JSON.parse(cached) : [];
  });
  const [collections, setCollections] = useState<AppCollection[]>(() => {
    const cached = safeStorage.getItem('collections_cache');
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(() => {
    const hasCache = safeStorage.getItem('content_cache');
    return !hasCache;
  });
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [hasPendingChanges, setHasPendingChanges] = useState(() => {
    return !!safeStorage.getItem('pending_chunk_updates');
  });

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const finalizeChanges = async () => {
    if (!['owner', 'admin'].includes(profile?.role || '')) return;
    const pendingStr = safeStorage.getItem('pending_chunk_updates');
    if (!pendingStr) return;
    
    const pendingChunkIds = JSON.parse(pendingStr) as string[];
    if (pendingChunkIds.length === 0) return;

    try {
        const { writeBatch, doc } = await import('firebase/firestore');
        const batch = writeBatch(db);
        const now = Date.now();
        const versions: Record<string, number> = {};

        for (const cid of pendingChunkIds) {
            const chunkStr = safeStorage.getItem('content_chunk_' + cid);
            if (chunkStr) {
                batch.set(doc(db, 'content_chunks', cid), { items: JSON.parse(chunkStr) }, { merge: true });
                versions[cid] = now;
            }
        }
        
        batch.set(doc(db, 'chunk_meta', 'versions'), versions, { merge: true });
        await batch.commit();
        
        const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
        let localMeta: Record<string, number> = {};
        try { localMeta = JSON.parse(localMetaString); } catch(e) {}
        Object.assign(localMeta, versions);
        safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));

        safeStorage.removeItem('pending_chunk_updates');
        setHasPendingChanges(false);
        console.log("Sync successful.");
    } catch (e) {
        console.error("Sync failed", e);
    }
  };

  useEffect(() => {
    if (!profile || !['owner', 'admin'].includes(profile.role)) return;
    const interval = setInterval(() => {
        const pending = safeStorage.getItem('pending_chunk_updates');
        if (pending) {
            finalizeChanges();
        }
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [profile?.role]);

  useEffect(() => {
    if (profile?.role === 'owner' && hasPendingChanges) {
        finalizeChanges();
    }
  }, [profile?.role, hasPendingChanges]);

  const augmentedContentList = useMemo(() => {
    return contentList.map(c => {
      if (c.addedBy && (!c.addedByName || !c.addedByRole)) {
        const adder = allUsers.find(u => u.uid === c.addedBy);
        if (adder) {
          return {
            ...c,
            addedByName: adder.displayName || adder.email || 'Unknown',
            addedByRole: adder.role || 'user'
          };
        }
      }
      return c;
    });
  }, [contentList, allUsers]);

  const refreshContentFromLocal = () => {
    const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
    let localMeta: Record<string, number> = {};
    try { localMeta = JSON.parse(localMetaString); } catch(e) {}
    
    const rawContentMap: Record<string, Content> = {};
    for (const chunkId of Object.keys(localMeta)) {
        const chunkStr = safeStorage.getItem('content_chunk_' + chunkId);
        if (chunkStr) {
            try {
                const items = JSON.parse(chunkStr);
                Object.entries(items).forEach(([id, item]: [string, any]) => {
                    const expanded = expandContent({ ...item, id }, chunkId);
                    rawContentMap[expanded.id] = expanded;
                });
            } catch(e) {}
        }
    }
    const rawContent = Object.values(rawContentMap);
    rawContent.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    const isAdminOrEditor = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');
    if (!isAdminOrEditor) {
        const sanitized = rawContent.map(c => {
            let minimalSeasons: any[] = [];
            if (c.seasons) {
              try {
                const parsed = Array.isArray(c.seasons) ? c.seasons : JSON.parse(c.seasons as string);
                minimalSeasons = parsed.map((s: any) => ({
                  seasonNumber: s.seasonNumber,
                  episodes: s.episodes && s.episodes.length > 0 ? [{ episodeNumber: s.episodes[s.episodes.length - 1].episodeNumber }] : []
                }));
              } catch(err) {}
            }
            return { ...c, movieLinks: undefined, seasons: minimalSeasons.length > 0 ? JSON.stringify(minimalSeasons) : undefined, _isMinimal: true } as Content;
        });
        setContentList(sanitized);
        safeStorage.setItem('content_cache', JSON.stringify(sanitized));
    } else {
        setContentList(rawContent);
        safeStorage.setItem('content_cache', JSON.stringify(rawContent));
    }
  };

  useEffect(() => {
    if (authProfileLoading) return;
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    let unsubContent: (() => void) | undefined = undefined;

    const setupListener = async () => {
      const { onSnapshot, doc, getDocs, collection, writeBatch, getDoc } = await import('firebase/firestore');
      const q = doc(db, 'chunk_meta', 'versions');
      unsubContent = onSnapshot(q, async (snapshot) => {
        let versions = snapshot.data() || {};
        
        if (Object.keys(versions).length === 0 && ['owner', 'admin'].includes(profile?.role || '')) {
           try {
            const chunksSnap = await getDocs(collection(db, 'content_chunks'));
            const newVersions: Record<string, number> = {};
            const batch = writeBatch(db);
            chunksSnap.docs.forEach(d => {
              const now = Date.now();
              newVersions[d.id] = now;
              safeStorage.setItem('content_chunk_' + d.id, JSON.stringify(d.data().items || {}));
            });
            batch.set(doc(db, 'chunk_meta', 'versions'), newVersions);
            await batch.commit();
            versions = newVersions;
          } catch(e) { console.error(e); }
        }

        let localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
        let localMeta: Record<string, number> = {};
        try { localMeta = JSON.parse(localMetaString); } catch(e) {}
        
        const chunksToFetch: string[] = [];
        for (const [chunkId, version] of Object.entries(versions)) {
          const hasData = !!safeStorage.getItem('content_chunk_' + chunkId);
          if (!hasData || !localMeta[chunkId] || localMeta[chunkId] < (version as number)) {
            chunksToFetch.push(chunkId);
          }
        }
        
        if (chunksToFetch.length > 0) {
            await Promise.all(chunksToFetch.map(async (chunkId) => {
               try {
                   const chunkDoc = await getDoc(doc(db, 'content_chunks', chunkId));
                   if (chunkDoc.exists()) {
                       const items = chunkDoc.data().items || {};
                       safeStorage.setItem('content_chunk_' + chunkId, JSON.stringify(items));
                       localMeta[chunkId] = versions[chunkId] as number;
                   }
               } catch(e) { console.error(e); }
            }));
            safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
        }
        
        refreshContentFromLocal();
        setLoading(false);
      }, (error) => {
        console.error("Content listener error:", error);
        handleFirestoreError(error, OperationType.GET, 'chunk_meta');
        setLoading(false);
      });
    };

    setupListener();
    return () => { if (unsubContent) unsubContent(); };
  }, [profile?.role, authProfileLoading]);

  useEffect(() => {
    if (authProfileLoading) return;
    if (!navigator.onLine) return;
    const isAdmin = ['owner', 'admin', 'content_manager', 'manager'].includes(profile?.role || '');
    let unsubs: (() => void)[] = [];
    const setupStaticListeners = async () => {
        const { onSnapshot, collection, getDocs } = await import('firebase/firestore');
        if (isAdmin) {
          unsubs.push(onSnapshot(collection(db, 'genres'), snap => {
            const raw = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            let items: any[] = [];
            const allDoc = raw.find(d => d.id === 'all');
            if (allDoc && allDoc.list) items = [...allDoc.list];
            raw.filter(d => d.id !== 'all').forEach(newItem => {
              const idx = items.findIndex(i => i.id === newItem.id);
              if (idx !== -1) items[idx] = newItem;
              else items.push(newItem);
            });
            const sorted = items.sort((a, b) => (a.order || 0) - (b.order || 0));
            setGenres(sorted); safeStorage.setItem('genres_cache', JSON.stringify(sorted));
          }));
          unsubs.push(onSnapshot(collection(db, 'languages'), snap => {
            const raw = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            let items: any[] = [];
            const allDoc = raw.find(d => d.id === 'all');
            if (allDoc && allDoc.list) items = [...allDoc.list];
            raw.filter(d => d.id !== 'all').forEach(newItem => {
              const idx = items.findIndex(i => i.id === newItem.id);
              if (idx !== -1) items[idx] = newItem;
              else items.push(newItem);
            });
            const sorted = items.sort((a, b) => (a.order || 0) - (b.order || 0));
            setLanguages(sorted); safeStorage.setItem('languages_cache', JSON.stringify(sorted));
          }));
          unsubs.push(onSnapshot(collection(db, 'qualities'), snap => {
            const raw = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            let items: any[] = [];
            const allDoc = raw.find(d => d.id === 'all');
            if (allDoc && allDoc.list) items = [...allDoc.list];
            raw.filter(d => d.id !== 'all').forEach(newItem => {
              const idx = items.findIndex(i => i.id === newItem.id);
              if (idx !== -1) items[idx] = newItem;
              else items.push(newItem);
            });
            const sorted = items.sort((a, b) => (a.order || 0) - (b.order || 0));
            setQualities(sorted); safeStorage.setItem('qualities_cache', JSON.stringify(sorted));
          }));
          unsubs.push(onSnapshot(collection(db, 'collections'), snap => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppCollection)).sort((a, b) => (a.order || 0) - (b.order || 0));
            setCollections(data); safeStorage.setItem('collections_cache', JSON.stringify(data));
          }));
        } else {
          try {
            const [g, l, q, c] = await Promise.all([
              getDocs(collection(db, 'genres')), getDocs(collection(db, 'languages')),
              getDocs(collection(db, 'qualities')), getDocs(collection(db, 'collections'))
            ]);
            
            const process = (snap: any) => {
              const raw = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
              let items: any[] = [];
              const allDoc = raw.find((d: any) => d.id === 'all');
              if (allDoc && allDoc.list) items = [...allDoc.list];
              raw.filter((d: any) => d.id !== 'all').forEach((newItem: any) => {
                const idx = items.findIndex(i => i.id === newItem.id);
                if (idx !== -1) items[idx] = newItem;
                else items.push(newItem);
              });
              return items.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
            };

            const gd = process(g);
            const ld = process(l);
            const qd = process(q);
            const cd = c.docs.map(d => ({ id: d.id, ...d.data() } as AppCollection)).sort((a, b) => (a.order || 0) - (b.order || 0));
            
            setGenres(gd); setLanguages(ld); setQualities(qd); setCollections(cd);
            safeStorage.setItem('genres_cache', JSON.stringify(gd));
            safeStorage.setItem('languages_cache', JSON.stringify(ld));
            safeStorage.setItem('qualities_cache', JSON.stringify(qd));
            safeStorage.setItem('collections_cache', JSON.stringify(cd));
          } catch(err) {}
        }
    };
    setupStaticListeners();
    return () => unsubs.forEach(u => u());
  }, [profile?.role, authProfileLoading]);

  const saveContentInternal = async (content: Content, localOnly = false) => {
    const isOwnerOrAdmin = ['owner', 'admin'].includes(profile?.role || '');
    const { cleanContentForChunk } = await import('../utils/chunkUtils');
    const minified = cleanContentForChunk(content);
    let chunkId = content.chunkId;
    const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
    let localMeta: Record<string, number> = {};
    try { localMeta = JSON.parse(localMetaString); } catch(e) {}
    if (!chunkId) {
        for (const cid of Object.keys(localMeta)) {
            const chunkStr = safeStorage.getItem('content_chunk_' + cid);
            if (chunkStr && chunkStr.includes(`"${content.id}"`)) {
                chunkId = cid;
                break;
            }
        }
    }
    if (!chunkId) {
        const prefix = content.type === 'movie' ? 'movie_chunk_' : 'series_chunk_';
        const matching = Object.keys(localMeta).filter(k => k.startsWith(prefix)).sort();
        chunkId = matching.length > 0 ? matching[matching.length - 1] : `${prefix}0`;
        if (!localMeta[chunkId]) localMeta[chunkId] = 0;
    }
    const chunkStr = safeStorage.getItem('content_chunk_' + chunkId) || '{}';
    const chunkItems = JSON.parse(chunkStr);
    chunkItems[content.id] = minified;
    safeStorage.setItem('content_chunk_' + chunkId, JSON.stringify(chunkItems));
    if (isOwnerOrAdmin) {
        const pendingStr = safeStorage.getItem('pending_chunk_updates') || '[]';
        const pendingIds = new Set(JSON.parse(pendingStr));
        pendingIds.add(chunkId);
        safeStorage.setItem('pending_chunk_updates', JSON.stringify(Array.from(pendingIds)));
        setHasPendingChanges(true);
    }
    setContentList(prev => {
        const idx = prev.findIndex(c => c.id === content.id);
        const newList = [...prev];
        if (idx !== -1) newList[idx] = { ...content, chunkId };
        else newList.push({ ...content, chunkId });
        return newList.sort((a, b) => (a.order || 0) - (b.order || 0));
    });
    if (!localOnly && !isOwnerOrAdmin) {
        const { saveContentToChunk } = await import('../utils/chunkUtils');
        await saveContentToChunk(content);
    }
  };

  const updateOrder = async (updates: {id: string, order: number}[]) => {
     const newList = [...contentList];
     const updateMap = new Map(updates.map(u => [u.id, u.order]));
     let changed = false;
     newList.forEach(item => {
        if (updateMap.has(item.id) && item.order !== updateMap.get(item.id)) {
          item.order = updateMap.get(item.id);
          changed = true;
        }
     });
     if (changed) {
        setContentList(newList);
        if (['owner', 'admin'].includes(profile?.role || '')) {
            const affectedItems = newList.filter(item => updateMap.has(item.id));
            for (const item of affectedItems) {
                await saveContentInternal(item, true); 
            }
        }
     }
  };

  const saveContent = (content: Content) => saveContentInternal(content);

  const updateContentFields = async (updates: { id: string, fields: Partial<Content>, chunkId?: string }[]) => {
    const isOwnerOrAdmin = ['owner', 'admin'].includes(profile?.role || '');
    const affectedChunkIds = new Set<string>();
    const { minifyContent } = await import('../utils/chunkUtils');

    for (const update of updates) {
        let chunkId = update.chunkId;
        if (!chunkId) {
            chunkId = contentList.find(c => c.id === update.id)?.chunkId;
        }
        if (!chunkId) continue;
        
        affectedChunkIds.add(chunkId);
        const chunkStr = safeStorage.getItem('content_chunk_' + chunkId);
        if (chunkStr) {
            const items = JSON.parse(chunkStr);
            if (items[update.id]) {
                const minifiedPayload = minifyContent(update.fields);
                items[update.id] = { ...items[update.id], ...minifiedPayload };
                safeStorage.setItem('content_chunk_' + chunkId, JSON.stringify(items));
            }
        }
    }

    if (isOwnerOrAdmin && affectedChunkIds.size > 0) {
        const pendingStr = safeStorage.getItem('pending_chunk_updates') || '[]';
        const pendingIds = new Set(JSON.parse(pendingStr));
        affectedChunkIds.forEach(cid => pendingIds.add(cid));
        safeStorage.setItem('pending_chunk_updates', JSON.stringify(Array.from(pendingIds)));
        setHasPendingChanges(true);
    }

    setContentList(prev => {
        const next = [...prev];
        updates.forEach(u => {
            const idx = next.findIndex(c => c.id === u.id);
            if (idx !== -1) next[idx] = { ...next[idx], ...u.fields };
        });
        return next;
    });

    if (!isOwnerOrAdmin) {
        const { updateContentFieldsInChunks } = await import('../utils/chunkUtils');
        await updateContentFieldsInChunks(updates);
    }
  };

  const deleteMultipleContents = async (items: { id: string, chunkId?: string }[]) => {
    const isOwnerOrAdmin = ['owner', 'admin'].includes(profile?.role || '');
    const affectedChunkIds = new Set<string>();

    for (const item of items) {
        let chunkId = item.chunkId;
        if (!chunkId) {
            chunkId = contentList.find(c => c.id === item.id)?.chunkId;
        }
        if (!chunkId) continue;
        
        affectedChunkIds.add(chunkId);
        const chunkStr = safeStorage.getItem('content_chunk_' + chunkId);
        if (chunkStr) {
            const chunkItems = JSON.parse(chunkStr);
            delete chunkItems[item.id];
            safeStorage.setItem('content_chunk_' + chunkId, JSON.stringify(chunkItems));
        }
    }

    if (isOwnerOrAdmin && affectedChunkIds.size > 0) {
        const pendingStr = safeStorage.getItem('pending_chunk_updates') || '[]';
        const pendingIds = new Set(JSON.parse(pendingStr));
        affectedChunkIds.forEach(cid => pendingIds.add(cid));
        safeStorage.setItem('pending_chunk_updates', JSON.stringify(Array.from(pendingIds)));
        setHasPendingChanges(true);
    }

    const idsToDelete = new Set(items.map(i => i.id));
    setContentList(prev => prev.filter(c => !idsToDelete.has(c.id)));

    if (!isOwnerOrAdmin) {
        const { deleteContentsFromChunks } = await import('../utils/chunkUtils');
        await deleteContentsFromChunks(items);
    }
  };

  const updateAuxiliaryCollection = async (type: 'genre' | 'language' | 'quality', items: any[]) => {
    if (!['owner', 'admin'].includes(profile?.role || '')) return;
    try {
        const { writeBatch, collection, getDocs, doc } = await import('firebase/firestore');
        const collectionName = type === 'quality' ? 'qualities' : `${type}s`;
        const batch = writeBatch(db);
        
        // Delete all existing
        const snapshot = await getDocs(collection(db, collectionName));
        snapshot.docs.forEach(d => batch.delete(d.ref));
        
        // Add new
        items.forEach((item, idx) => {
          const docRef = doc(collection(db, collectionName), item.id || Math.random().toString(36).substr(2, 9));
          const data: any = { name: item.name, order: idx };
          if (type === 'quality') data.color = item.color;
          batch.set(docRef, data);
        });
        
        await batch.commit();
    } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, type);
    }
  };

  const addCollection = async (collectionData: Omit<AppCollection, 'id'>) => {
    if (!['owner', 'admin'].includes(profile?.role || '')) return;
    try {
        const { addDoc, collection } = await import('firebase/firestore');
        await addDoc(collection(db, 'collections'), collectionData);
    } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'collections');
    }
  };

  const updateCollection = async (id: string, updates: Partial<AppCollection>) => {
    if (!['owner', 'admin'].includes(profile?.role || '')) return;
    try {
        const { updateDoc, doc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'collections', id), updates);
    } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `collections/${id}`);
    }
  };

  const deleteCollection = async (id: string) => {
    if (!['owner', 'admin'].includes(profile?.role || '')) return;
    try {
        const { deleteDoc, doc } = await import('firebase/firestore');
        await deleteDoc(doc(db, 'collections', id));
    } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `collections/${id}`);
    }
  };

  const addAuxiliaryItem = async (type: 'genre' | 'language' | 'quality', item: any) => {
    if (!['owner', 'admin'].includes(profile?.role || '')) return;
    try {
        const { setDoc, doc, collection } = await import('firebase/firestore');
        const collectionName = type === 'quality' ? 'qualities' : `${type}s`;
        const colRef = collection(db, collectionName);
        const newDocRef = item.id ? doc(colRef, item.id) : doc(colRef);
        await setDoc(newDocRef, { ...item, id: newDocRef.id });
    } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, type);
    }
  };

  const updateAuxiliaryItem = async (type: 'genre' | 'language' | 'quality', id: string, updates: any) => {
    if (!['owner', 'admin'].includes(profile?.role || '')) return;
    try {
        const { updateDoc, doc, collection } = await import('firebase/firestore');
        const collectionName = type === 'quality' ? 'qualities' : `${type}s`;
        await updateDoc(doc(collection(db, collectionName), id), updates);
    } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${type}/${id}`);
    }
  };

  const deleteAuxiliaryItem = async (type: 'genre' | 'language' | 'quality', id: string) => {
    if (!['owner', 'admin'].includes(profile?.role || '')) return;
    try {
        const { deleteDoc, doc, collection } = await import('firebase/firestore');
        const collectionName = type === 'quality' ? 'qualities' : `${type}s`;
        await deleteDoc(doc(collection(db, collectionName), id));
    } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `${type}/${id}`);
    }
  };

  const deleteContent = async (id: string, chunkId?: string) => {
    await deleteMultipleContents([{ id, chunkId }]);
  };

  const getContent = async (id: string): Promise<Content | null> => {
    const item = contentList.find(c => c.id === id);
    if (!item) return null;
    const isFull = !!item.movieLinks || (item.type === 'series' && item.seasons);
    if (isFull) return item;
    let chunkId = item.chunkId;
    if (!chunkId) {
        const { getDocs, collection } = await import('firebase/firestore');
        const chunksSnap = await getDocs(collection(db, 'content_chunks'));
        for (const d of chunksSnap.docs) {
          if (d.data().items[id]) {
            chunkId = d.id;
            break;
          }
        }
    }
    if (!chunkId) return item;
    try {
      const chunkStr = safeStorage.getItem('content_chunk_' + chunkId);
      if (chunkStr) {
         const items = JSON.parse(chunkStr);
         if (items[id]) {
            const expanded = expandContent({ ...items[id], id }, chunkId);
            expanded.order = item.order;
            return expanded;
         }
      }
    } catch(e) {}
    return item;
  };

  return (
    <ContentContext.Provider value={{ 
        contentList: augmentedContentList, genres, languages, qualities, collections, loading, isOffline, 
        updateOrder, getContent, saveContent, deleteContent, updateContentFields, deleteMultipleContents, 
        updateAuxiliaryCollection, addCollection, updateCollection, deleteCollection, 
        addAuxiliaryItem, updateAuxiliaryItem, deleteAuxiliaryItem, finalizeChanges, hasPendingChanges 
    }}>
      {children}
    </ContentContext.Provider>
  );
}

export const useContent = () => {
  const context = useContext(ContentContext);
  if (context === undefined) throw new Error('useContent must be used within a ContentProvider');
  return context;
};
