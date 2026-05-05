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
  reorderCollections: (id1: string, id2: string) => Promise<void>;
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

  const [contentList, setContentList] = useState<Content[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [collections, setCollections] = useState<AppCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
    // Initial sync from local storage for IMMEDIATE UI feedback
    refreshContentFromLocal();
    refreshCollectionsFromLocal();
    
    // Load auxiliary from cache
    const g = safeStorage.getItem('genres_cache');
    if (g) setGenres(JSON.parse(g));
    const l = safeStorage.getItem('languages_cache');
    if (l) setLanguages(JSON.parse(l));
    const q = safeStorage.getItem('qualities_cache');
    if (q) setQualities(JSON.parse(q));
    
    setLoading(false);
  }, []);
  const [hasPendingChanges, setHasPendingChanges] = useState(() => {
    return !!safeStorage.getItem('pending_chunk_updates') || !!safeStorage.getItem('pending_collection_updates');
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

  const reorderCollections = async (id1: string, id2: string) => {
    let coll1: AppCollection | undefined;
    let coll2: AppCollection | undefined;

    setCollections(prev => {
        const next = [...prev];
        const idx1 = next.findIndex(c => c.id === id1);
        const idx2 = next.findIndex(c => c.id === id2);
        
        if (idx1 !== -1 && idx2 !== -1) {
            const item1 = next[idx1];
            const item2 = next[idx2];
            
            let order1 = item1.order ?? 0;
            let order2 = item2.order ?? 0;

            // If orders are same, we must force a difference to actually move them
            if (order1 === order2) {
                // Determine direction based on index. If idx1 < idx2, idx1 was higher in list.
                // We want to swap them, so if we are moving one down, we want its order to be smaller.
                if (idx1 < idx2) {
                    // moving item1 down
                    order1 = order2 - 1;
                } else {
                    // moving item1 up
                    order1 = order2 + 1;
                }
            }

            next[idx1] = { ...item1, order: order2, updatedAt: new Date().toISOString() };
            next[idx2] = { ...item2, order: order1, updatedAt: new Date().toISOString() };
            
            coll1 = next[idx1];
            coll2 = next[idx2];
        }
        return next.sort((a, b) => (b.order || 0) - (a.order || 0));
    });

    if (!coll1 || !coll2) return;

    // Persist changes locally (synchronously to avoid race conditions with multiple clicks)
    const pendingIds = new Set(JSON.parse(safeStorage.getItem('pending_collection_updates') || '[]'));
    
    [coll1, coll2].forEach(coll => {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('local_collection_chunk_'));
        for (const key of keys) {
            const chunkStr = safeStorage.getItem(key);
            if (chunkStr && chunkStr.includes(`"${coll.id}"`)) {
                const items = JSON.parse(chunkStr);
                if (items[coll.id]) {
                    items[coll.id] = coll;
                    safeStorage.setItem(key, JSON.stringify(items));
                    pendingIds.add(key.replace('local_collection_chunk_', ''));
                    break;
                }
            }
        }
    });

    const allCached = JSON.parse(safeStorage.getItem('collections_cache') || '[]');
    [coll1, coll2].forEach(coll => {
        const idx = allCached.findIndex((c: any) => c.id === coll.id);
        if (idx !== -1) allCached[idx] = coll;
        else allCached.push(coll);
    });
    
    safeStorage.setItem('collections_cache', JSON.stringify(allCached.sort((a: any, b: any) => (b.order || 0) - (a.order || 0))));
    safeStorage.setItem('pending_collection_updates', JSON.stringify(Array.from(pendingIds)));
    setHasPendingChanges(true);
  };

  const finalizeChanges = async () => {
    if (!['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '')) return;
    const contentPendingStr = safeStorage.getItem('pending_chunk_updates');
    const collectionPendingStr = safeStorage.getItem('pending_collection_updates');
    
    if (!contentPendingStr && !collectionPendingStr) {
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
        if (contentPendingStr) {
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
        }

        // Handle collection chunks
        if (collectionPendingStr) {
            const pendingCollChunkIds = JSON.parse(collectionPendingStr) as string[];
            let maxCollIndex = 0;
            for (const cid of pendingCollChunkIds) {
                const chunkStr = safeStorage.getItem('local_collection_chunk_' + cid);
                if (chunkStr) {
                    batch.set(doc(db, 'collection_chunks', cid), {
                        items: JSON.parse(chunkStr),
                        updatedAt: serverTimestamp()
                    });
                    const match = cid.match(/(\d+)$/);
                    if (match) maxCollIndex = Math.max(maxCollIndex, parseInt(match[1]));
                }
            }
            
            versionsUpdate.collections = {
                version: now,
                updatedAt: serverTimestamp(),
                latestChunkId: COLLECTION_CHUNK_PREFIX + maxCollIndex
            };
        }

        batch.set(doc(db, 'chunk_meta', 'versions'), versionsUpdate, { merge: true });
        await batch.commit();
        
        const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
        let localMeta: Record<string, any> = {};
        try { localMeta = JSON.parse(localMetaString); } catch(e) {}

        if (contentPendingStr) {
            Object.assign(localMeta, versionsUpdate);
            safeStorage.removeItem('pending_chunk_updates');
        }

        if (collectionPendingStr) {
            safeStorage.removeItem('pending_collection_updates');
            localMeta.collections = versionsUpdate.collections.version;
        }

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
    const chunkKeys = Object.keys(localStorage).filter(k => 
        k.startsWith('content_chunk_') || 
        k.startsWith('movie_chunk_') || 
        k.startsWith('series_chunk_')
    );

    for (const key of chunkKeys) {
        const chunkStr = safeStorage.getItem(key);
        if (chunkStr) {
            try {
                const items = JSON.parse(chunkStr);
                Object.entries(items).forEach(([id, item]: [string, any]) => {
                    const expanded = expandContent({ ...item, id }, key);
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

  const refreshCollectionsFromLocal = () => {
    let allCollections: AppCollection[] = [];
    const keys = Object.keys(localStorage).filter(k => k.startsWith('local_collection_chunk_'));
    
    for (const key of keys) {
        const chunkStr = safeStorage.getItem(key);
        if (chunkStr) {
            try {
                const items = JSON.parse(chunkStr);
                const chunkList = Object.values(items) as AppCollection[];
                allCollections = [...allCollections, ...chunkList];
            } catch(e) {}
        }
    }
    
    const sorted = allCollections.sort((a, b) => (b.order || 0) - (a.order || 0));
    setCollections(sorted);
    safeStorage.setItem('collections_cache', JSON.stringify(sorted));
    return sorted;
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
    const pendingStr = safeStorage.getItem('pending_chunk_updates') || '[]';
    const pendingChunkIds = new Set(JSON.parse(pendingStr));

    for (const [chunkId, versionMeta] of Object.entries(versions)) {
        if (chunkId === 'collections' || chunkId === 'notifications' || chunkId === 'lastGlobalUpdate') continue;
        if (pendingChunkIds.has(chunkId)) continue; // SKIP pending chunks to avoid overwriting with old server data

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
    // Scan all chunks to ensure the item is removed from any previous chunk it might have been in
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('content_chunk_') || key.startsWith('movie_chunk_') || key.startsWith('series_chunk_')) {
            if (key !== 'content_chunk_' + chunkId) {
                const s = safeStorage.getItem(key);
                if (s && s.includes(`"${content.id}"`)) {
                    try {
                        const items = JSON.parse(s);
                        if (items[content.id]) {
                            delete items[content.id];
                            safeStorage.setItem(key, JSON.stringify(items));
                            // Mark this old chunk as needing sync too
                            // Extract actual chunk ID from key (handling both legacy and new formats)
                            const cid = key.startsWith('content_chunk_') ? key.replace('content_chunk_', '') : key;
                            
                            const pendingStr = safeStorage.getItem('pending_chunk_updates') || '[]';
                            const pendingIds = new Set(JSON.parse(pendingStr));
                            pendingIds.add(cid);
                            safeStorage.setItem('pending_chunk_updates', JSON.stringify(Array.from(pendingIds)));
                        }
                    } catch(e) {}
                }
            }
        }
    });

    const chunkStr = safeStorage.getItem('content_chunk_' + chunkId) || '{}';
    const chunkItems = JSON.parse(chunkStr);
    delete chunkItems[content.id];
    // Always written first
    const newChunkItems = { [content.id]: minified, ...chunkItems };
    safeStorage.setItem('content_chunk_' + chunkId, JSON.stringify(newChunkItems));
    
    // Update local metadata immediately so refreshContentFromLocal can find the new version/chunk
    localMeta[chunkId] = Date.now();
    safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));

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
                
                // Update local metadata immediately
                const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
                let localMeta: Record<string, number> = {};
                try { localMeta = JSON.parse(localMetaString); } catch(e) {}
                localMeta[chunkId] = Date.now();
                safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
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

    // Optimistically update collections state for immediate UI feedback
    const updatedColl = { ...coll, updatedAt: new Date().toISOString() };
    setCollections(prev => {
        const next = [...prev];
        const idx = next.findIndex(c => c.id === updatedColl.id);
        if (idx !== -1) next[idx] = updatedColl;
        else next.push(updatedColl);
        return next.sort((a, b) => (b.order || 0) - (a.order || 0));
    });

    let chunkId: string | null = null;
    let latestIndex = 0;
    const match = latestCollChunkIdRef.current.match(/(\d+)$/);
    if (match) latestIndex = parseInt(match[1]);

    let chunkItems: Record<string, AppCollection> = {};

    // Use local storage exclusively to find the chunk - avoid SLOW Firestore lookups in loop
    for (let i = 0; i <= latestIndex; i++) {
        const cid = COLLECTION_CHUNK_PREFIX + i;
        const localStr = safeStorage.getItem('local_collection_chunk_' + cid);
        if (localStr) {
            const items = JSON.parse(localStr);
            if (items[updatedColl.id]) {
                chunkId = cid;
                items[updatedColl.id] = updatedColl;
                chunkItems = items;
                break;
            }
        }
    }

    if (!chunkId) {
        // Find if it was recently added and not yet in a chunk list (but somehow has an ID)
        // Default to latest chunk
        chunkId = COLLECTION_CHUNK_PREFIX + latestIndex;
        const localStr = safeStorage.getItem('local_collection_chunk_' + chunkId) || '{}';
        const items = JSON.parse(localStr);
        
        if (Object.keys(items).length >= COLLECTION_CHUNK_SIZE) {
            latestIndex++;
            chunkId = COLLECTION_CHUNK_PREFIX + latestIndex;
            latestCollChunkIdRef.current = chunkId;
            chunkItems = { [updatedColl.id]: updatedColl };
        } else {
            items[updatedColl.id] = updatedColl;
            chunkItems = items;
        }
    }

    // Save updated chunk back to local storage
    safeStorage.setItem('local_collection_chunk_' + chunkId, JSON.stringify(chunkItems));
    
    // Update collections cache for persistence across reloads
    const allCached = JSON.parse(safeStorage.getItem('collections_cache') || '[]');
    const idx = allCached.findIndex((c: any) => c.id === updatedColl.id);
    if (idx !== -1) allCached[idx] = updatedColl;
    else allCached.push(updatedColl);
    safeStorage.setItem('collections_cache', JSON.stringify(allCached.sort((a: any, b: any) => (b.order || 0) - (a.order || 0))));

    // Mark as pending
    const pendingStr = safeStorage.getItem('pending_collection_updates') || '[]';
    const pendingIds = new Set(JSON.parse(pendingStr));
    pendingIds.add(chunkId);
    safeStorage.setItem('pending_collection_updates', JSON.stringify(Array.from(pendingIds)));
    setHasPendingChanges(true);
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
    const allCached = JSON.parse(safeStorage.getItem('collections_cache') || '[]');
    safeStorage.setItem('collections_cache', JSON.stringify(allCached.filter((c: any) => c.id !== id)));

    // Find and update chunk locally
    let foundChunkId: string | null = null;
    const keys = Object.keys(localStorage).filter(k => k.startsWith('local_collection_chunk_'));
    for (const key of keys) {
        const chunkStr = safeStorage.getItem(key);
        if (chunkStr) {
            const items = JSON.parse(chunkStr);
            if (items[id]) {
                delete items[id];
                safeStorage.setItem(key, JSON.stringify(items));
                foundChunkId = key.replace('local_collection_chunk_', '');
                break;
            }
        }
    }

    if (foundChunkId) {
        const pendingStr = safeStorage.getItem('pending_collection_updates') || '[]';
        const pendingIds = new Set(JSON.parse(pendingStr));
        pendingIds.add(foundChunkId);
        safeStorage.setItem('pending_collection_updates', JSON.stringify(Array.from(pendingIds)));
        setHasPendingChanges(true);
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
        updateAuxiliaryCollection, addCollection, updateCollection, deleteCollection, reorderCollections,
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
