import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { 
  doc, 
  getDoc, 
  getDocs, 
  collection, 
  writeBatch, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  deleteField
} from 'firebase/firestore';
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

  const COLLECTION_CHUNK_SIZE = 1000;
  const COLLECTION_CHUNK_PREFIX = 'collection_chunk_';
  const latestCollChunkIdRef = useRef<string>('collection_chunk_0');

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
    if (!['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '')) return;
    const contentPendingStr = safeStorage.getItem('pending_chunk_updates');
    
    if (!contentPendingStr) {
        setHasPendingChanges(false);
        return;
    }
    
    try {
        const batch = writeBatch(db);
        const now = Date.now();
        const versionsUpdate: Record<string, any> = { 
            lastGlobalUpdate: serverTimestamp() 
        };

        // Handle content chunks
        const pendingChunkIds = JSON.parse(contentPendingStr) as string[];
        for (const cid of pendingChunkIds) {
            const chunkStr = safeStorage.getItem('content_chunk_' + cid);
            if (chunkStr) {
                batch.set(doc(db, 'content_chunks', cid), { 
                    items: JSON.parse(chunkStr),
                    updatedAt: serverTimestamp()
                });
                versionsUpdate[cid] = now;
            }
        }

        batch.set(doc(db, 'chunk_meta', 'versions'), versionsUpdate, { merge: true });
        await batch.commit();
        
        const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
        let localMeta: Record<string, any> = {};
        try { localMeta = JSON.parse(localMetaString); } catch(e) {}

        Object.assign(localMeta, versionsUpdate);
        safeStorage.removeItem('pending_chunk_updates');

        safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
        setHasPendingChanges(false);
        console.log(`Sync successful.`);
    } catch (e) {
        console.error("Sync failed", e);
        throw e;
    }
  };



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
    let localMeta: Record<string, any> = {};
    try { localMeta = JSON.parse(localMetaString); } catch(e) {}
    
    const rawContentMap: Record<string, Content> = {};
    for (const chunkId of Object.keys(localMeta)) {
        if (chunkId === 'collections' || chunkId === 'notifications' || chunkId === 'lastGlobalUpdate') continue;
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
    rawContent.sort((a, b) => (b.order || 0) - (a.order || 0));
    
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

  const syncWithServer = async () => {
    if (!navigator.onLine) {
        setLoading(false);
        return;
    }
    const isAdmin = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');

    let versions: Record<string, any> = {};
    try {
        const metaDoc = await getDoc(doc(db, 'chunk_meta', 'versions'));
        if (metaDoc.exists()) {
            versions = metaDoc.data() || {};
        } else if (isAdmin) {
            // First time setup or recovery
            const chunksSnap = await getDocs(collection(db, 'content_chunks'));
            if (chunksSnap.empty) {
                // Check for legacy individual content to migrate
                const contentSnap = await getDocs(collection(db, 'content'));
                if (!contentSnap.empty) {
                    console.log(`Migrating ${contentSnap.size} legacy content items to chunks...`);
                    const allContent = contentSnap.docs.map(d => ({ id: d.id, ...d.data() } as Content));
                    const { rebuildAllChunks } = await import('../utils/chunkUtils');
                    await rebuildAllChunks(allContent);
                    const newMetaDoc = await getDoc(doc(db, 'chunk_meta', 'versions'));
                    versions = newMetaDoc.data() || {};
                    // Optional: delete legacy individual content
                    // const delBatch = writeBatch(db);
                    // contentSnap.docs.forEach(d => delBatch.delete(d.ref));
                    // await delBatch.commit();
                }
            } else {
                const newVersions: Record<string, number> = {};
                const batch = writeBatch(db);
                chunksSnap.docs.forEach(d => {
                    const now = Date.now();
                    newVersions[d.id] = now;
                    safeStorage.setItem('content_chunk_' + d.id, JSON.stringify(d.data().items || {}));
                });
                batch.set(doc(db, 'chunk_meta', 'versions'), newVersions, { merge: true });
                await batch.commit();
                versions = newVersions;
            }
        }
    } catch(e) { console.error("Error fetching chunk_meta", e); }

    let localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
    let localMeta: Record<string, number> = {};
    try { localMeta = JSON.parse(localMetaString); } catch(e) {}
    
    // Process chunks
    const chunksToFetch: string[] = [];
    for (const [chunkId, versionMeta] of Object.entries(versions)) {
        if (chunkId === 'collections' || chunkId === 'notifications' || chunkId === 'lastGlobalUpdate') continue;
        const version = typeof versionMeta === 'object' ? (versionMeta as any).version : versionMeta;
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
    
    // Always refresh content to catch any changes
    refreshContentFromLocal();

    // Handle auxiliary data
    try {
        const fetchAux = async (name: string, setFn: any, cacheKey: string) => {
            const snap = await getDocs(collection(db, name));
            const raw = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
            let items: any[] = [];
            const allDoc = raw.find((d: any) => d.id === 'all');
            if (allDoc && allDoc.list) items = [...allDoc.list];
            raw.filter((d: any) => d.id !== 'all').forEach((newItem: any) => {
                const idx = items.findIndex(i => i.id === newItem.id);
                if (idx !== -1) items[idx] = newItem;
                else items.push(newItem);
            });
            const sorted = items.sort((a: any, b: any) => (b.order || 0) - (a.order || 0));
            setFn(sorted);
            safeStorage.setItem(cacheKey, JSON.stringify(sorted));
        };

        if (!safeStorage.getItem('genres_cache')) await fetchAux('genres', setGenres, 'genres_cache');
        if (!safeStorage.getItem('languages_cache')) await fetchAux('languages', setLanguages, 'languages_cache');
        if (!safeStorage.getItem('qualities_cache')) await fetchAux('qualities', setQualities, 'qualities_cache');

        // Handle collections with versioning and chunks
        let collectionsMeta = versions.collections;
        const isAdmin = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');

        // Migration logic: If no collection chunks exist but legacy collections do, migrate them
        if (!collectionsMeta && isAdmin) {
            try {
                const legacySnap = await getDocs(collection(db, 'collections'));
                if (!legacySnap.empty) {
                    console.log(`Migrating ${legacySnap.size} legacy collections to chunks...`);
                    const legacyItems: Record<string, AppCollection> = {};
                    legacySnap.docs.forEach(d => {
                        legacyItems[d.id] = { id: d.id, ...d.data() } as AppCollection;
                    });

                    const batch = writeBatch(db);
                    const now = Date.now();
                    const cid = COLLECTION_CHUNK_PREFIX + '0';
                    
                    batch.set(doc(db, 'collection_chunks', cid), {
                        items: legacyItems,
                        updatedAt: serverTimestamp()
                    });

                    collectionsMeta = {
                        version: now,
                        updatedAt: serverTimestamp(),
                        latestChunkId: cid
                    };

                    batch.set(doc(db, 'chunk_meta', 'versions'), { 
                        collections: collectionsMeta,
                        lastGlobalUpdate: serverTimestamp()
                    }, { merge: true });

                    await batch.commit();
                    
                    // Cleanup legacy collections to complete the "replacement"
                    const delBatch = writeBatch(db);
                    legacySnap.docs.forEach(d => delBatch.delete(d.ref));
                    await delBatch.commit();
                    console.log("Legacy collections deleted.");
                }
            } catch(e) { console.error("Migration failed", e); }
        }

        // Migration logic for FCM tokens
        if (isAdmin) {
            try {
                const metaDoc = await getDoc(doc(db, 'chunk_meta', 'versions'));
                const metaData = metaDoc.exists() ? metaDoc.data() : {};
                if (!metaData.fcm_tokens) {
                    const legacyTokensSnap = await getDocs(collection(db, 'fcm_tokens'));
                    // Only migrate if we have many individual docs and no chunking yet
                    const individualDocs = legacyTokensSnap.docs.filter(d => !d.id.startsWith('fcm_chunk_'));
                    if (individualDocs.length > 0) {
                        console.log(`Migrating ${individualDocs.length} legacy FCM tokens to chunks...`);
                        const tokensMap: Record<string, any> = {};
                        individualDocs.forEach(d => {
                            const data = d.data();
                            tokensMap[d.id] = data;
                        });

                        const batch = writeBatch(db);
                        const cid = 'fcm_chunk_0';
                        batch.set(doc(db, 'fcm_tokens', cid), tokensMap, { merge: true });
                        batch.set(doc(db, 'chunk_meta', 'versions'), {
                            fcm_tokens: {
                                latestChunkId: cid,
                                version: Date.now(),
                                updatedAt: serverTimestamp()
                            }
                        }, { merge: true });

                        await batch.commit();
                        
                        // Cleanup individual tokens
                        const delBatch = writeBatch(db);
                        individualDocs.forEach(d => delBatch.delete(d.ref));
                        await delBatch.commit();
                        console.log("Legacy FCM tokens cleaned up.");
                    }
                }
            } catch (e) {
                console.error("FCM Token migration failed:", e);
            }
        }

        const collectionsVersion = (collectionsMeta && typeof collectionsMeta === 'object' ? collectionsMeta.version : collectionsMeta) || 0;
        const localCollectionsVersion = localMeta.collections || 0;
        
        const latestCollChunkId = (collectionsMeta && typeof collectionsMeta === 'object' ? collectionsMeta.latestChunkId : null) || 'collection_chunk_0';
        latestCollChunkIdRef.current = latestCollChunkId;

        if (!safeStorage.getItem('collections_cache') || localCollectionsVersion < collectionsVersion) {
            let allCollections: AppCollection[] = [];
            
            const matchIndex = latestCollChunkId.match(/(\d+)$/);
            const maxIndex = matchIndex ? parseInt(matchIndex[1]) : 0;
            
            for (let i = 0; i <= maxIndex; i++) {
                try {
                    const cid = COLLECTION_CHUNK_PREFIX + i;
                    const cDoc = await getDoc(doc(db, 'collection_chunks', cid));
                    if (cDoc.exists()) {
                        const items = cDoc.data().items || {};
                        const chunkList = Object.values(items) as AppCollection[];
                        allCollections = [...allCollections, ...chunkList];
                        safeStorage.setItem('local_collection_chunk_' + cid, JSON.stringify(items));
                    }
                } catch(e) { console.error(e); }
            }
            
            const sorted = allCollections.sort((a, b) => (b.order || 0) - (a.order || 0));
            setCollections(sorted);
            safeStorage.setItem('collections_cache', JSON.stringify(sorted));
            
            localMeta.collections = collectionsVersion;
            safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
        }
    } catch(e) {}
    
    setLoading(false);
  };

  useEffect(() => {
    if (authProfileLoading) return;
    if (!navigator.onLine) {
        setLoading(false);
        return;
    }
    syncWithServer();

    const interval = setInterval(() => {
        syncWithServer();
        if (['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '')) {
            const pending = safeStorage.getItem('pending_chunk_updates');
            if (pending) finalizeChanges();
        }
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [profile?.role, authProfileLoading]);

  const saveContentInternal = async (content: Content, localOnly = false) => {
    const isAdminOrEditor = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');
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
        const maxSize = content.type === 'movie' ? 800 : 300;
        let matching = Object.keys(localMeta).filter(k => k.startsWith(prefix));
        
        // Sort by the chunk index so we can confidently pick the *first* defined chunk. e.g. move_chunk_0
        matching.sort((a, b) => {
            const numA = parseInt(a.replace(prefix, '')) || 0;
            const numB = parseInt(b.replace(prefix, '')) || 0;
            return numA - numB;
        });

        // Find first chunk with space
        for (const cid of matching) {
            const chunkStr = safeStorage.getItem('content_chunk_' + cid) || '{}';
            const items = JSON.parse(chunkStr);
            if (Object.keys(items).length < maxSize) {
                chunkId = cid;
                break;
            }
        }

        if (!chunkId) {
            // All existing chunks are full or no chunks exist, create new one
            chunkId = `${prefix}${matching.length}`;
        }
        if (!localMeta[chunkId]) localMeta[chunkId] = 0;
    }
    const chunkStr = safeStorage.getItem('content_chunk_' + chunkId) || '{}';
    const chunkItems = JSON.parse(chunkStr);
    delete chunkItems[content.id];
    // Always written first
    const newChunkItems = { [content.id]: minified, ...chunkItems };
    safeStorage.setItem('content_chunk_' + chunkId, JSON.stringify(newChunkItems));
    if (isAdminOrEditor) {
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
        return newList.sort((a, b) => (b.order || 0) - (a.order || 0));
    });
    if (!localOnly && !isAdminOrEditor) {
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
        newList.sort((a, b) => (b.order || 0) - (a.order || 0));
        setContentList(newList);
        if (['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '')) {
            const affectedItems = newList.filter(item => updateMap.has(item.id));
            for (const item of affectedItems) {
                await saveContentInternal(item, true); 
            }
        }
     }
  };

  const saveContent = (content: Content) => saveContentInternal(content);

  const updateContentFields = async (updates: { id: string, fields: Partial<Content>, chunkId?: string }[]) => {
    const isAdminOrEditor = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');
    const affectedChunkIds = new Set<string>();
    const { minifyContent } = await import('../utils/chunkUtils');

    for (const update of updates) {
        let chunkId = update.chunkId;
        if (!chunkId) {
            chunkId = contentList.find(c => c.id === update.id)?.chunkId;
        }
        if (!chunkId) {
            const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
            let localMeta: Record<string, number> = {};
            try { localMeta = JSON.parse(localMetaString); } catch(e) {}
            for (const cid of Object.keys(localMeta)) {
                const chunkStr = safeStorage.getItem('content_chunk_' + cid);
                if (chunkStr && chunkStr.includes(`"${update.id}"`)) {
                    chunkId = cid;
                    break;
                }
            }
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

    if (isAdminOrEditor && affectedChunkIds.size > 0) {
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

    if (!isAdminOrEditor) {
        const { updateContentFieldsInChunks } = await import('../utils/chunkUtils');
        await updateContentFieldsInChunks(updates);
    }
  };

  const deleteMultipleContents = async (items: { id: string, chunkId?: string }[]) => {
    const isAdminOrEditor = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');
    const affectedChunkIds = new Set<string>();

    for (const item of items) {
        let chunkId = item.chunkId;
        if (!chunkId) {
            chunkId = contentList.find(c => c.id === item.id)?.chunkId;
        }
        if (!chunkId) {
            const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
            let localMeta: Record<string, number> = {};
            try { localMeta = JSON.parse(localMetaString); } catch(e) {}
            for (const cid of Object.keys(localMeta)) {
                const chunkStr = safeStorage.getItem('content_chunk_' + cid);
                if (chunkStr && chunkStr.includes(`"${item.id}"`)) {
                    chunkId = cid;
                    break;
                }
            }
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

    if (isAdminOrEditor && affectedChunkIds.size > 0) {
        const pendingStr = safeStorage.getItem('pending_chunk_updates') || '[]';
        const pendingIds = new Set(JSON.parse(pendingStr));
        affectedChunkIds.forEach(cid => pendingIds.add(cid));
        safeStorage.setItem('pending_chunk_updates', JSON.stringify(Array.from(pendingIds)));
        setHasPendingChanges(true);
    }

    const idsToDelete = new Set(items.map(i => i.id));
    setContentList(prev => prev.filter(c => !idsToDelete.has(c.id)));

    if (!isAdminOrEditor) {
        const { deleteContentsFromChunks } = await import('../utils/chunkUtils');
        await deleteContentsFromChunks(items);
    }
  };

  const updateAuxiliaryCollection = async (type: 'genre' | 'language' | 'quality', items: any[]) => {
    if (!['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '')) return;
    try {
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

  const bumpCollectionsVersion = async () => {
    // No longer bumping directly to server, handled via finalizeChanges for consistency
    setHasPendingChanges(true);
  };

  const saveCollectionInternal = async (coll: AppCollection) => {
    const isAdmin = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');
    if (!isAdmin) return;

    setCollections(prev => {
        const idx = prev.findIndex(c => c.id === coll.id);
        const next = [...prev];
        if (idx !== -1) next[idx] = coll;
        else next.push(coll);
        return next.sort((a, b) => (b.order || 0) - (a.order || 0));
    });

    let chunkId: string | null = null;
    let latestIndex = 0;
    const match = latestCollChunkIdRef.current.match(/(\d+)$/);
    if (match) latestIndex = parseInt(match[1]);

    let chunkItems: Record<string, AppCollection> = {};

    for (let i = 0; i <= latestIndex; i++) {
        const cid = COLLECTION_CHUNK_PREFIX + i;
        const chunkDoc = await getDoc(doc(db, 'collection_chunks', cid));
        if (chunkDoc.exists()) {
            const items = chunkDoc.data().items || {};
            if (items[coll.id]) {
                chunkId = cid;
                items[coll.id] = coll;
                chunkItems = items;
                break;
            }
        }
    }

    if (!chunkId) {
        chunkId = COLLECTION_CHUNK_PREFIX + latestIndex;
        const chunkDoc = await getDoc(doc(db, 'collection_chunks', chunkId));
        const items = chunkDoc.exists() ? chunkDoc.data().items || {} : {};
        if (Object.keys(items).length >= COLLECTION_CHUNK_SIZE) {
            latestIndex++;
            chunkId = COLLECTION_CHUNK_PREFIX + latestIndex;
            latestCollChunkIdRef.current = chunkId;
            chunkItems = { [coll.id]: coll };
        } else {
            items[coll.id] = coll;
            chunkItems = items;
        }
    }

    try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'collection_chunks', chunkId), {
            items: chunkItems,
            updatedAt: serverTimestamp()
        });

        batch.set(doc(db, 'chunk_meta', 'versions'), {
            collections: {
                version: Date.now(),
                updatedAt: serverTimestamp(),
                latestChunkId: chunkId
            },
            lastGlobalUpdate: serverTimestamp()
        }, { merge: true });

        await batch.commit();
        safeStorage.setItem('local_collection_chunk_' + chunkId, JSON.stringify(chunkItems));
        
        // Refresh local cache
        const allCached = JSON.parse(safeStorage.getItem('collections_cache') || '[]');
        const idx = allCached.findIndex((c: any) => c.id === coll.id);
        if (idx !== -1) allCached[idx] = coll;
        else allCached.push(coll);
        safeStorage.setItem('collections_cache', JSON.stringify(allCached.sort((a: any, b: any) => (b.order || 0) - (a.order || 0))));
        
    } catch (e) {
        console.error("Failed to save collection to server:", e);
    }
  };

  const addCollection = async (collectionData: Omit<AppCollection, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 15);
    const newColl = { ...collectionData, id, updatedAt: new Date().toISOString() } as AppCollection;
    await saveCollectionInternal(newColl);
  };

  const updateCollection = async (id: string, updates: Partial<AppCollection>) => {
    const existing = collections.find(c => c.id === id);
    if (!existing) return;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await saveCollectionInternal(updated);
  };

  const deleteCollection = async (id: string) => {
    if (!['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '')) return;
    
    // Update local state
    setCollections(prev => prev.filter(c => c.id !== id));

    // Find and update chunk
    try {
        let foundChunkId: string | null = null;
        let chunkItems: any = null;

        const versionsDoc = await getDoc(doc(db, 'chunk_meta', 'versions'));
        let latestIndex = 0;
        if (versionsDoc.exists()) {
            const vData = versionsDoc.data();
            const lId = (vData.collections && vData.collections.latestChunkId) || 'collection_chunk_0';
            const m = lId.match(/(\d+)$/);
            if (m) latestIndex = parseInt(m[1]);
        }

        for (let i = 0; i <= latestIndex; i++) {
            const cid = COLLECTION_CHUNK_PREFIX + i;
            const cDoc = await getDoc(doc(db, 'collection_chunks', cid));
            if (cDoc.exists()) {
                const items = cDoc.data().items || {};
                if (items[id]) {
                    delete items[id];
                    foundChunkId = cid;
                    chunkItems = items;
                    break;
                }
            }
        }

        if (foundChunkId && chunkItems) {
            const batch = writeBatch(db);
            batch.set(doc(db, 'collection_chunks', foundChunkId), {
                items: chunkItems,
                updatedAt: serverTimestamp()
            });
            batch.set(doc(db, 'chunk_meta', 'versions'), { 
                collections: {
                    version: Date.now(),
                    updatedAt: serverTimestamp()
                },
                lastGlobalUpdate: serverTimestamp()
            }, { merge: true });

            await batch.commit();
            safeStorage.setItem('local_collection_chunk_' + foundChunkId, JSON.stringify(chunkItems));
            
            // Refresh local cache
            const allCached = JSON.parse(safeStorage.getItem('collections_cache') || '[]');
            safeStorage.setItem('collections_cache', JSON.stringify(allCached.filter((c: any) => c.id !== id)));
        }
    } catch (e) {
        console.error("Failed to delete collection from server:", e);
    }
  };

  const addAuxiliaryItem = async (type: 'genre' | 'language' | 'quality', item: any) => {
    if (!['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '')) return;
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
    if (!['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '')) return;
    try {
        const { updateDoc, doc, collection } = await import('firebase/firestore');
        const collectionName = type === 'quality' ? 'qualities' : `${type}s`;
        await updateDoc(doc(collection(db, collectionName), id), updates);
    } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${type}/${id}`);
    }
  };

  const deleteAuxiliaryItem = async (type: 'genre' | 'language' | 'quality', id: string) => {
    if (!['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '')) return;
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
