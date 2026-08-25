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
import { db, runWithNetwork } from '../firebase';
import { safeStorage } from '../utils/safeStorage';
import { expandContent, CONTENT_CHUNK_MOVIE_SIZE, CONTENT_CHUNK_SERIES_SIZE } from '../utils/chunkUtils';
import { seedStaticExportData } from '../utils/staticContentLoader';
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
  checkForUpdates: (force?: boolean) => Promise<{ updated: boolean; updatedContentCount: number; isInitialLoad?: boolean }>;
  quickRefreshCatalog: (manual?: boolean, prefetchedVersions?: Record<string, any>) => Promise<{ updated: boolean; updatedCount: number; message: string; isRelaxed?: boolean; isInitialLoad?: boolean }>;
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export function normalizeDataForComparison(val: any): any {
  if (val === null || val === undefined || val === "" || val === "[]" || val === "{}") return "";
  if (Array.isArray(val) && val.length === 0) return "";
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "" || trimmed === "[]" || trimmed === "{}") return "";
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length === 0) return "";
        if (typeof parsed === "object" && parsed !== null && Object.keys(parsed).length === 0) return "";
        return JSON.stringify(parsed);
      } catch (e) {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (Array.isArray(val)) {
    return JSON.stringify(val);
  }
  if (typeof val === "object" && val !== null) {
    return JSON.stringify(val);
  }
  return val;
}

export function isContentDataEqual(existing: any, updated: any): boolean {
  if (!existing || !updated) return false;
  const fieldsToCompare = [
    "title",
    "secondTitle",
    "type",
    "status",
    "description",
    "posterUrl",
    "sampleUrl",
    "year",
    "releaseDate",
    "runtime",
    "imdbRating",
    "country",
    "ottPlatform",
    "movieLinks",
    "seasons",
    "fullSeasonZip",
    "fullSeasonMkv",
    "genreIds",
    "languageIds",
    "qualityIds",
    "order",
    "comment",
    "cast",
    "addedBy",
    "category",
  ];

  for (const field of fieldsToCompare) {
    const normExisting = normalizeDataForComparison(existing[field]);
    const normUpdated = normalizeDataForComparison(updated[field]);
    if (normExisting !== normUpdated) {
      return false;
    }
  }
  return true;
}

export const checkHasPendingChanges = (): boolean => {
  try {
    const chunkUpdates = safeStorage.getItem('pending_chunk_updates');
    if (chunkUpdates && chunkUpdates !== '[]') {
      const arr = JSON.parse(chunkUpdates);
      if (Array.isArray(arr) && arr.length > 0) return true;
    }
    const collUpdates = safeStorage.getItem('pending_collection_updates');
    if (collUpdates && collUpdates !== '[]') {
      const arr = JSON.parse(collUpdates);
      if (Array.isArray(arr) && arr.length > 0) return true;
    }
    const metaUpdates = safeStorage.getItem('pending_metadata_updates');
    if (metaUpdates === 'true') return true;
  } catch (e) {}
  return false;
};

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, loading: authProfileLoading, refreshProfile } = useAuth();
  const { users: allUsers, finalizeUserChanges } = useUsers();

  const [contentList, setContentList] = useState<Content[]>(() => {
    const cached = safeStorage.getItem('content_cache');
    return cached ? JSON.parse(cached) : [];
  });
  const [genres, setGenres] = useState<Genre[]>(() => {
    const cached = safeStorage.getItem('genres_cache');
    return cached ? JSON.parse(cached).sort((a: any, b: any) => (a.order || 999) - (b.order || 999)) : [];
  });
  const [languages, setLanguages] = useState<Language[]>(() => {
    const cached = safeStorage.getItem('languages_cache');
    return cached ? JSON.parse(cached).sort((a: any, b: any) => (a.order || 999) - (b.order || 999)) : [];
  });
  const [qualities, setQualities] = useState<Quality[]>(() => {
    const cached = safeStorage.getItem('qualities_cache');
    return cached ? JSON.parse(cached).sort((a: any, b: any) => (a.order || 999) - (b.order || 999)) : [];
  });
  const [collections, setCollections] = useState<AppCollection[]>(() => {
    const cached = safeStorage.getItem('collections_cache');
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(() => {
    return !safeStorage.getItem('content_cache') || !safeStorage.getItem('collections_cache');
  });
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
    // Seed static content export immediately if local cache is empty or incomplete
    const contentCache = safeStorage.getItem('content_cache');
    const localMeta = safeStorage.getItem('chunk_meta_versions');
    if (!contentCache || contentCache === '[]' || !localMeta) {
      seedStaticExportData();
    }

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
  const [hasPendingChanges, setHasPendingChanges] = useState(() => checkHasPendingChanges());

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

    // First check and balance all content chunks locally before constructing the sync payload
    const { rebalanceLocalChunks } = await import('../utils/chunkUtils');
    rebalanceLocalChunks();

    const contentPendingStr = safeStorage.getItem('pending_chunk_updates');
    const collectionPendingStr = safeStorage.getItem('pending_collection_updates');
    const metadataPending = safeStorage.getItem('pending_metadata_updates') === 'true';
    
    if (!contentPendingStr && !collectionPendingStr && !metadataPending) {
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
            const pendingItemsMapStr = safeStorage.getItem('pending_item_updates') || '{}';
            const pendingItemsMap = JSON.parse(pendingItemsMapStr);

            for (const cid of pendingChunkIds) {
                const chunkStr = safeStorage.getItem('content_chunk_' + cid) || safeStorage.getItem(cid);
                if (chunkStr) {
                    const parsedItems = JSON.parse(chunkStr);
                    const itemIds = pendingItemsMap[cid];
                    
                    if (Array.isArray(itemIds) && itemIds.length > 0) {
                        const updateMap: Record<string, any> = {};
                        for (const itemId of itemIds) {
                            if (parsedItems[itemId]) {
                                updateMap[itemId] = parsedItems[itemId];
                            } else {
                                updateMap[itemId] = deleteField();
                            }
                        }
                        batch.set(doc(db, 'content_chunks', cid), {
                            items: updateMap,
                            updatedAt: serverTimestamp()
                        }, { merge: true });
                    } else {
                        batch.set(doc(db, 'content_chunks', cid), { 
                            items: parsedItems,
                            updatedAt: serverTimestamp()
                        }, { merge: true });
                    }
                    
                    versionsUpdate[cid] = {
                        version: now,
                        count: Object.keys(parsedItems).length
                    };
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

        if (metadataPending) {
            const mGenres = JSON.parse(safeStorage.getItem('genres_cache') || '[]');
            const mLanguages = JSON.parse(safeStorage.getItem('languages_cache') || '[]');
            const mQualities = JSON.parse(safeStorage.getItem('qualities_cache') || '[]');
            
            batch.set(doc(db, 'content_chunks', 'metadata'), {
                genres: mGenres,
                languages: mLanguages,
                qualities: mQualities,
                updatedAt: serverTimestamp()
            });
            
            versionsUpdate.metadata = {
                version: now,
                updatedAt: serverTimestamp()
            };
        }

        batch.set(doc(db, 'chunk_meta', 'versions'), versionsUpdate, { merge: true });
        await batch.commit();
        
        const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
        let localMeta: Record<string, any> = {};
        try { localMeta = JSON.parse(localMetaString); } catch(e) {}

        // Update local version metadata with the exact server versions just committed
        for (const [key, val] of Object.entries(versionsUpdate)) {
            if (key !== 'lastGlobalUpdate') {
                localMeta[key] = val;
            }
        }

        if (contentPendingStr) {
            safeStorage.removeItem('pending_chunk_updates');
            safeStorage.removeItem('pending_item_updates');
        }

        if (collectionPendingStr) {
            safeStorage.removeItem('pending_collection_updates');
        }

        if (metadataPending) {
            safeStorage.removeItem('pending_metadata_updates');
        }

        safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
        const { updateChunkMetaLocalCache } = await import('../utils/chunkMeta');
        updateChunkMetaLocalCache(versionsUpdate);

        setHasPendingChanges(false);
        refreshContentFromLocal();
        refreshCollectionsFromLocal();
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
    rawContent.sort((a, b) => {
        // Use order if explicitly set, otherwise use createdAt for newest-first (reverse order)
        if (a.order !== undefined && b.order !== undefined) {
            return b.order - a.order;
        }
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
    
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

  const syncWithServer = async (force: boolean = false): Promise<{ updatedSomething: boolean; updatedContentCount: number; isInitialLoad?: boolean }> => {
    // Guest user bypass: use static content export without Firestore
    if (!profile && !user) {
        seedStaticExportData();
        refreshContentFromLocal();
        refreshCollectionsFromLocal();
        setLoading(false);
        return { updatedSomething: false, updatedContentCount: 0, isInitialLoad: false };
    }

    let updatedSomething = false;
    let updatedContentCount = 0;
    if (!navigator.onLine) {
        setLoading(false);
        return { updatedSomething: false, updatedContentCount: 0, isInitialLoad: false };
    }
    const isAdmin = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');

    const localContentBeforeSync = safeStorage.getItem('content_cache');
    let localItemCountBeforeSync = 0;
    try {
        const parsed = JSON.parse(localContentBeforeSync || '[]');
        localItemCountBeforeSync = Array.isArray(parsed) ? parsed.length : 0;
    } catch(e) {
        localItemCountBeforeSync = 0;
    }
    const isLibraryEmptyInitially = localItemCountBeforeSync === 0;

    let versions: Record<string, any> = {};
    try {
        const metaData = await import('../utils/chunkMeta').then(m => m.getChunkMeta(force));
        if (Object.keys(metaData).length > 0) {
            versions = metaData;
        }
    } catch(e) { console.error("Error fetching chunk_meta", e); }

    let localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
    let localMeta: Record<string, any> = {};
    try { localMeta = JSON.parse(localMetaString); } catch(e) {}
    
    // Process chunks
    const chunksToFetch: string[] = [];
    const pendingStr = safeStorage.getItem('pending_chunk_updates') || '[]';
    const pendingChunkIds = new Set(JSON.parse(pendingStr));

    for (const [chunkId, versionMeta] of Object.entries(versions)) {
        if (chunkId === 'collections' || chunkId === 'notifications' || chunkId === 'lastGlobalUpdate' || chunkId === 'metadata' || chunkId === 'users' || chunkId === 'fcm_tokens') continue;

        const version = typeof versionMeta === 'object' ? (versionMeta as any).version : versionMeta;
        const localV = localMeta[chunkId];
        const localVersion = typeof localV === 'object' ? localV.version : localV;
        const hasData = !!safeStorage.getItem('content_chunk_' + chunkId);
        
        if (!hasData || !localVersion || localVersion < (version as number)) {
            chunksToFetch.push(chunkId);
        }
    }
    
    if (chunksToFetch.length > 0) {
        const pendingItemsMapStr = safeStorage.getItem('pending_item_updates') || '{}';
        const pendingItemsMap = JSON.parse(pendingItemsMapStr);

        await Promise.all(chunksToFetch.map(async (chunkId) => {
            try {
                const chunkDoc = await getDoc(doc(db, 'content_chunks', chunkId));
                if (chunkDoc.exists()) {
                    let items = chunkDoc.data().items || {};
                    const localChunkStr = safeStorage.getItem('content_chunk_' + chunkId);
                    const localItems: Record<string, any> = localChunkStr ? JSON.parse(localChunkStr) : {};

                    // Count updated content items (added or modified). DO NOT count deleted contents!
                    for (const [id, incomingItem] of Object.entries(items)) {
                        const localItem = localItems[id];
                        if (!localItem) {
                            updatedContentCount++;
                        } else if (!isContentDataEqual(localItem, incomingItem)) {
                            updatedContentCount++;
                        }
                    }
                    
                    if (pendingChunkIds.has(chunkId)) {
                        const itemIds = pendingItemsMap[chunkId];
                        
                        if (Array.isArray(itemIds) && itemIds.length > 0) {
                            for (const itemId of itemIds) {
                                if (localItems[itemId]) {
                                    items[itemId] = localItems[itemId];
                                } else {
                                    delete items[itemId];
                                }
                            }
                        } else {
                            items = { ...items, ...localItems };
                        }
                    } else {
                        // The server is the source of truth, but we don't want to lose local attributes 
                        // if they are not tracked on server. Actually, chunks ARE fully tracked on server.
                        // So we can just use items natively.
                    }
                    
                    safeStorage.setItem('content_chunk_' + chunkId, JSON.stringify(items));
                    localMeta[chunkId] = typeof versions[chunkId] === 'object' ? versions[chunkId] : { version: versions[chunkId], count: Object.keys(items).length };
                }
            } catch(e) { console.error(e); }
        }));
        safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
    }
    
    // Always refresh content to catch any changes
    refreshContentFromLocal();

    // Handle auxiliary data (Metadata chunk)
    try {
        const isAdmin = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');
        let metadataMeta = versions.metadata;

        const metadataVersion = metadataMeta ? (typeof metadataMeta === 'object' ? metadataMeta.version : metadataMeta) : 0;
        const localMetaV = localMeta.metadata;
        const localMetaVersion = typeof localMetaV === 'object' ? localMetaV.version : localMetaV;
        const genresCacheStr = safeStorage.getItem('genres_cache');
        const hasMetadata = !!genresCacheStr && genresCacheStr !== '[]';
        const hasPendingMetadata = !!safeStorage.getItem('pending_metadata_updates');
        
        if (!hasPendingMetadata && (!hasMetadata || !localMetaVersion || localMetaVersion < metadataVersion)) {
            try {
                const metaDoc = await getDoc(doc(db, 'content_chunks', 'metadata'));
                if (metaDoc.exists()) {
                    const data = metaDoc.data();
                    
                    let chunksGenres = data.genres || [];
                    let chunksLanguages = data.languages || [];
                    let chunksQualities = data.qualities || [];

                    const localGenres = JSON.parse(safeStorage.getItem('genres_cache') || '[]');
                    const localLanguages = JSON.parse(safeStorage.getItem('languages_cache') || '[]');
                    const localQualities = JSON.parse(safeStorage.getItem('qualities_cache') || '[]');

                    const mergeArrays = (local: any[], server: any[]) => {
                        const merged = [...local];
                        server.forEach(s => {
                            const idx = merged.findIndex(l => l.id === s.id || l.name === s.name);
                            if (idx !== -1) merged[idx] = s;
                            else merged.push(s);
                        });
                        return merged;
                    };

                    chunksGenres = mergeArrays(localGenres, chunksGenres);
                    chunksLanguages = mergeArrays(localLanguages, chunksLanguages);
                    chunksQualities = mergeArrays(localQualities, chunksQualities);

                    safeStorage.setItem('genres_cache', JSON.stringify(chunksGenres));
                    safeStorage.setItem('languages_cache', JSON.stringify(chunksLanguages));
                    safeStorage.setItem('qualities_cache', JSON.stringify(chunksQualities));
                    if (metadataVersion) {
                        localMeta.metadata = metadataVersion;
                        safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
                    }
                    setGenres([...chunksGenres].sort((a: any, b: any) => (a.order || 999) - (b.order || 999)));
                    setLanguages([...chunksLanguages].sort((a: any, b: any) => (a.order || 999) - (b.order || 999)));
                    setQualities([...chunksQualities].sort((a: any, b: any) => (a.order || 999) - (b.order || 999)));
                    updatedSomething = true;
                }
            } catch(e) { console.error("Error fetching metadata chunk", e) }
        }

        // Handle collections with versioning and chunks
        const collectionsMeta = versions.collections;
        const collectionsVersion = (collectionsMeta && typeof collectionsMeta === 'object' ? collectionsMeta.version : collectionsMeta) || 0;
        const localCollectionsVersion = localMeta.collections || 0;
        
        const latestCollChunkId = (collectionsMeta && typeof collectionsMeta === 'object' ? collectionsMeta.latestChunkId : null) || 'collection_chunk_0';
        latestCollChunkIdRef.current = latestCollChunkId;

        if (!safeStorage.getItem('collections_cache') || localCollectionsVersion < collectionsVersion) {
            let allCollections: AppCollection[] = [];
            
            const matchIndex = latestCollChunkId.match(/(\d+)$/);
            const maxIndex = matchIndex ? parseInt(matchIndex[1]) : 0;
            
            const collPromises = [];
            for (let i = 0; i <= maxIndex; i++) {
                const cid = COLLECTION_CHUNK_PREFIX + i;
                collPromises.push(
                    getDoc(doc(db, 'collection_chunks', cid))
                        .then(cDoc => ({ cid, cDoc }))
                        .catch(e => { console.error(e); return null; })
                );
            }
            const collResults = await Promise.all(collPromises);
            for (const res of collResults) {
                if (res && res.cDoc && res.cDoc.exists()) {
                    const items = res.cDoc.data().items || {};
                    const chunkList = Object.values(items) as AppCollection[];
                    allCollections = [...allCollections, ...chunkList];
                    safeStorage.setItem('local_collection_chunk_' + res.cid, JSON.stringify(items));
                }
            }
            
            const sorted = allCollections.sort((a, b) => (b.order || 0) - (a.order || 0));
            setCollections(sorted);
            safeStorage.setItem('collections_cache', JSON.stringify(sorted));
            
            localMeta.collections = collectionsVersion;
            safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
            updatedSomething = true;
        }
        
        if (chunksToFetch.length > 0) updatedSomething = true;
    } catch(e) {}
    
    setLoading(false);
    return { 
      updatedSomething, 
      updatedContentCount: isLibraryEmptyInitially ? 0 : updatedContentCount,
      isInitialLoad: isLibraryEmptyInitially && updatedSomething
    };
  };


  // Automatic mount checking is disabled here to avoid duplicate Firestore checks.
  // The RefreshAppDataManager component now acts as the sole orchestrator of app-open and daily updates.

  const checkForUpdates = async (force: boolean = false): Promise<{ updated: boolean; updatedContentCount: number; isInitialLoad?: boolean }> => {
    if (authProfileLoading) {
        return { updated: false, updatedContentCount: 0, isInitialLoad: false };
    }

    // Guest user bypass: use static content export without Firestore
    if (!profile && !user) {
        seedStaticExportData();
        refreshContentFromLocal();
        refreshCollectionsFromLocal();
        setLoading(false);
        return { updated: false, updatedContentCount: 0, isInitialLoad: false };
    }

    const now = Date.now();
    const lastSuccessfulMetaCheckStr = safeStorage.getItem('last_successful_meta_check');
    const lastSuccessfulMetaCheck = lastSuccessfulMetaCheckStr ? parseInt(lastSuccessfulMetaCheckStr) : 0;
    
    // "turn off running app if data not read and not get or last read data is more that 30 hours passed then pause app and show last updated data"
    const isOver30Hours = now - lastSuccessfulMetaCheck > 30 * 60 * 60 * 1000;
    
    if (isOver30Hours && lastSuccessfulMetaCheck > 0 && !navigator.onLine) {
        window.dispatchEvent(new CustomEvent('app_paused_offline', { 
            detail: { 
                paused: true, 
                lastSynced: new Date(lastSuccessfulMetaCheck).toLocaleString() 
            } 
        }));
    } else {
        window.dispatchEvent(new CustomEvent('app_paused_offline', { 
            detail: { paused: false } 
        }));
    }

    if (!navigator.onLine) {
        setLoading(false);
        return { updated: false, updatedContentCount: 0, isInitialLoad: false };
    }
    
    const isAdmin = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');
    
    // PKT is UTC+5. Shift back by 7 hours to align the daily update cycle with 7 AM PKT.
    const shiftedTime = new Date(now + (5 - 7) * 60 * 60 * 1000);
    const checkPeriod = `${shiftedTime.getUTCFullYear()}-${shiftedTime.getUTCMonth() + 1}-${shiftedTime.getUTCDate()}`;

    // Period check to avoid redundant auto-checks
    const lastCheckPeriod = safeStorage.getItem('last_meta_check_period');
    
    // Always refresh if first login / never successfully synced
    const hasCompletedSync = safeStorage.getItem('has_completed_initial_sync');
    const localContent = safeStorage.getItem('content_cache');
    let localItemCount = 0;
    try {
        const parsed = JSON.parse(localContent || '[]');
        localItemCount = Array.isArray(parsed) ? parsed.length : 0;
    } catch (e) {
        localItemCount = 0;
    }
    const isLibraryEmpty = localItemCount === 0;
    const noLocalData = !hasCompletedSync || isLibraryEmpty;

    if (!force && lastCheckPeriod === checkPeriod && !noLocalData) {
        // Already checked for this period (the 7AM cycle)
        setLoading(false);
        return { updated: false, updatedContentCount: 0, isInitialLoad: false };
    }
    
    // Proceed with sync - ALWAYS show 'syncing' toast when updating data (both scheduled and force)
    window.dispatchEvent(new CustomEvent('sync_status', {
      detail: {
        status: 'syncing',
        isInitialLoad: noLocalData || isLibraryEmpty,
        message: (noLocalData || isLibraryEmpty) ? 'Loading Data...' : 'Updating data...'
      }
    }));

    let updatedSomething = false;
    let serverUpdatedCount = 0;
    let isInitialLoadDone = false;

    const tasks: Promise<boolean>[] = [];

    // Trigger profile refresh if logged in
    if (profile) {
      tasks.push(
        refreshProfile(force, force ? 'manual' : 'auto')
          .then(res => Boolean(res))
          .catch(err => {
            console.error("Profile refresh error:", err);
            return false;
          })
      );
    }
    
    // Refresh users list if admin and push pending user changes
    if (isAdmin) {
      finalizeUserChanges(force).catch(console.error);
    }

    // Sync content with server
    tasks.push(
      syncWithServer(force)
        .then(res => {
          serverUpdatedCount = res.updatedContentCount;
          if (res.isInitialLoad) isInitialLoadDone = true;
          return Boolean(res.updatedSomething);
        })
        .catch(err => {
          console.error("Sync with server error:", err);
          return false;
        })
    );

    const syncResults = await Promise.all(tasks);
    if (syncResults.some(Boolean)) {
      updatedSomething = true;
    }
    
    // Record that we checked in this period
    safeStorage.setItem('last_meta_check_period', checkPeriod);
    safeStorage.setItem('last_successful_meta_check', Date.now().toString());
    safeStorage.setItem('has_completed_initial_sync', 'true');

    if (isInitialLoadDone || (isLibraryEmpty && updatedSomething)) {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'success',
            isInitialLoad: true,
            updatedContentCount: 0,
            message: 'Loaded All Contents Successfully'
          }
        }));
    } else if (serverUpdatedCount > 0) {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'success',
            isInitialLoad: false,
            updatedContentCount: serverUpdatedCount,
            message: `${serverUpdatedCount} content updated`
          }
        }));
    } else {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: updatedSomething ? 'success' : 'up-to-date',
            isInitialLoad: false,
            updatedContentCount: 0,
            message: updatedSomething ? 'Data updated successfully' : 'Data is up to date'
          }
        }));
    }

    return { 
      updated: updatedSomething, 
      updatedContentCount: isInitialLoadDone ? 0 : serverUpdatedCount,
      isInitialLoad: isInitialLoadDone || (isLibraryEmpty && updatedSomething)
    };
  };

  const quickRefreshCatalog = async (manual: boolean = false, prefetchedVersions?: Record<string, any>): Promise<{ updated: boolean; updatedCount: number; message: string; isRelaxed?: boolean; isInitialLoad?: boolean }> => {
    // Guest user bypass: use static content export without Firestore
    if (!profile && !user) {
        seedStaticExportData();
        refreshContentFromLocal();
        refreshCollectionsFromLocal();
        setLoading(false);
        return { updated: false, updatedCount: 0, message: 'Catalog loaded from static export for guest user', isRelaxed: true, isInitialLoad: false };
    }

    const LAST_QUICK_REFRESH_KEY = 'last_catalog_quick_refresh_time';
    const now = Date.now();

    // Check if library is currently empty
    const localContentBefore = safeStorage.getItem('content_cache');
    let localCountBefore = 0;
    try {
      const parsed = JSON.parse(localContentBefore || '[]');
      localCountBefore = Array.isArray(parsed) ? parsed.length : 0;
    } catch(e) {
      localCountBefore = 0;
    }
    const isLibraryEmpty = localCountBefore === 0;

    // Check relaxation interval for automatic checks (e.g. 5 minutes)
    const lastCheckStr = safeStorage.getItem(LAST_QUICK_REFRESH_KEY);
    const lastCheck = lastCheckStr ? parseInt(lastCheckStr, 10) : 0;
    if (!manual && !isLibraryEmpty && lastCheck && (now - lastCheck < 5 * 60 * 1000)) {
      return {
        updated: false,
        updatedCount: 0,
        message: 'Data is up to date',
        isRelaxed: true,
        isInitialLoad: false
      };
    }

    if (!navigator.onLine) {
      if (manual) {
        window.dispatchEvent(new CustomEvent('sync_status', { 
          detail: {
            status: 'up-to-date',
            isInitialLoad: false,
            updatedContentCount: 0,
            message: 'Data is up to date'
          } 
        }));
      }
      return {
        updated: false,
        updatedCount: 0,
        message: 'Data is up to date',
        isRelaxed: false,
        isInitialLoad: false
      };
    }

    // Dispatch 'syncing' status when manually triggered or when library is empty/initial load
    if (manual || isLibraryEmpty) {
      window.dispatchEvent(new CustomEvent('sync_status', {
        detail: {
          status: 'syncing',
          isInitialLoad: isLibraryEmpty,
          message: isLibraryEmpty ? 'Loading Data...' : 'Updating data...'
        }
      }));
    }

    let updatedSomething = false;
    let totalUpdatedContentCount = 0;

    try {
      // 1. Fetch chunk_meta versions doc from Firestore (read-only)
      let versions: Record<string, any> = prefetchedVersions || {};
      if (!prefetchedVersions) {
        const metaDocSnap = await runWithNetwork(() => getDoc(doc(db, 'chunk_meta', 'versions')));
        versions = metaDocSnap.exists() ? metaDocSnap.data() : {};
      }

      safeStorage.setItem('cached_chunk_meta_doc', JSON.stringify(versions));
      safeStorage.setItem('last_chunk_meta_fetch_time', now.toString());

      const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
      let localMeta: Record<string, any> = {};
      try { localMeta = JSON.parse(localMetaString); } catch(e) {}

      // 2. Compare content chunks
      const chunksToFetch: string[] = [];
      for (const [chunkId, versionMeta] of Object.entries(versions)) {
        if (['collections', 'notifications', 'lastGlobalUpdate', 'metadata', 'users', 'fcm_tokens', 'settings'].includes(chunkId)) continue;
        
        const serverVersion = typeof versionMeta === 'object' ? (versionMeta as any).version : versionMeta;
        const localV = localMeta[chunkId];
        const localVersion = typeof localV === 'object' ? localV.version : localV;
        const hasData = !!safeStorage.getItem('content_chunk_' + chunkId);

        if (!hasData || !localVersion || localVersion < (serverVersion as number)) {
          chunksToFetch.push(chunkId);
        }
      }

      if (chunksToFetch.length > 0) {
        await Promise.all(chunksToFetch.map(async (chunkId) => {
          try {
            const chunkDoc = await runWithNetwork(() => getDoc(doc(db, 'content_chunks', chunkId)));
            if (chunkDoc.exists()) {
              const items = chunkDoc.data().items || {};
              const localChunkStr = safeStorage.getItem('content_chunk_' + chunkId);
              let localItems: Record<string, any> = {};
              if (localChunkStr) {
                try { localItems = JSON.parse(localChunkStr); } catch(e) {}
              }

              // Count added or modified content items (do not count deleted)
              if (!isLibraryEmpty) {
                for (const [id, incomingItem] of Object.entries(items)) {
                  const localItem = localItems[id];
                  if (!localItem) {
                    totalUpdatedContentCount++;
                  } else if (!isContentDataEqual(localItem, incomingItem)) {
                    totalUpdatedContentCount++;
                  }
                }
              }

              safeStorage.setItem('content_chunk_' + chunkId, JSON.stringify(items));
              localMeta[chunkId] = typeof versions[chunkId] === 'object'
                ? versions[chunkId]
                : { version: versions[chunkId], count: Object.keys(items).length };
              updatedSomething = true;
            }
          } catch(err) {
            console.error(`Error fetching chunk ${chunkId}:`, err);
          }
        }));
        safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
        refreshContentFromLocal();
      }

      // 3. Compare metadata version (genres, languages, qualities)
      const metadataMeta = versions.metadata;
      const metadataVersion = metadataMeta ? (typeof metadataMeta === 'object' ? metadataMeta.version : metadataMeta) : 0;
      const localMetaV = localMeta.metadata;
      const localMetaVersion = typeof localMetaV === 'object' ? localMetaV.version : localMetaV;
      const genresCacheStr = safeStorage.getItem('genres_cache');
      const hasMetadata = !!genresCacheStr && genresCacheStr !== '[]';

      if (!hasMetadata || !localMetaVersion || localMetaVersion < metadataVersion) {
        try {
          const metaDoc = await getDoc(doc(db, 'content_chunks', 'metadata'));
          if (metaDoc.exists()) {
            const data = metaDoc.data();
            const chunksGenres = data.genres || [];
            const chunksLanguages = data.languages || [];
            const chunksQualities = data.qualities || [];

            safeStorage.setItem('genres_cache', JSON.stringify(chunksGenres));
            safeStorage.setItem('languages_cache', JSON.stringify(chunksLanguages));
            safeStorage.setItem('qualities_cache', JSON.stringify(chunksQualities));
            if (metadataVersion) {
              localMeta.metadata = metadataVersion;
              safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
            }
            setGenres([...chunksGenres].sort((a: any, b: any) => (a.order || 999) - (b.order || 999)));
            setLanguages([...chunksLanguages].sort((a: any, b: any) => (a.order || 999) - (b.order || 999)));
            setQualities([...chunksQualities].sort((a: any, b: any) => (a.order || 999) - (b.order || 999)));
            updatedSomething = true;
          }
        } catch (e) {
          console.error("Error fetching metadata chunk:", e);
        }
      }

      // 4. Compare collections version
      const collectionsMeta = versions.collections;
      const collectionsVersion = (collectionsMeta && typeof collectionsMeta === 'object' ? collectionsMeta.version : collectionsMeta) || 0;
      const localCollectionsVersion = localMeta.collections || 0;
      const hasCollectionsCache = !!safeStorage.getItem('collections_cache');

      if (!hasCollectionsCache || localCollectionsVersion < collectionsVersion) {
        try {
          const latestCollChunkId = (collectionsMeta && typeof collectionsMeta === 'object' ? collectionsMeta.latestChunkId : null) || 'collection_chunk_0';
          const matchIndex = latestCollChunkId.match(/(\d+)$/);
          const maxIndex = matchIndex ? parseInt(matchIndex[1]) : 0;
          
          let allCollections: AppCollection[] = [];
          const collPromises = [];
          for (let i = 0; i <= maxIndex; i++) {
            const cid = 'collection_chunk_' + i;
            collPromises.push(
              getDoc(doc(db, 'collection_chunks', cid))
                .then(cDoc => ({ cid, cDoc }))
                .catch(() => null)
            );
          }
          const collResults = await Promise.all(collPromises);
          for (const res of collResults) {
            if (res && res.cDoc && res.cDoc.exists()) {
              const items = res.cDoc.data().items || {};
              const chunkList = Object.values(items) as AppCollection[];
              allCollections = [...allCollections, ...chunkList];
              safeStorage.setItem('local_collection_chunk_' + res.cid, JSON.stringify(items));
            }
          }
          const sorted = allCollections.sort((a, b) => (b.order || 0) - (a.order || 0));
          setCollections(sorted);
          safeStorage.setItem('collections_cache', JSON.stringify(sorted));
          localMeta.collections = collectionsVersion;
          safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
          updatedSomething = true;
        } catch (e) {
          console.error("Error fetching collection chunks:", e);
        }
      }

      // 5. Compare self user version
      const uid = profile?.uid;
      if (uid) {
        const chunkUsersMeta = versions.users || {};
        const serverUserVer = chunkUsersMeta[uid] || 0;
        const localUserVer = parseInt(safeStorage.getItem(`profile_version_${uid}`) || '0', 10);

        if ((serverUserVer > 0 && serverUserVer > localUserVer) || (!profile && localUserVer === 0)) {
          try {
            await refreshProfile(true, 'manual');
            updatedSomething = true;
          } catch(e) {
            console.error("Error refreshing self user profile:", e);
          }
        }
      }

      // 6. Settings are handled and synchronized by SettingsContext
      // Mark the 5-minute relaxation timestamp
      safeStorage.setItem(LAST_QUICK_REFRESH_KEY, now.toString());

      if (isLibraryEmpty) {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'success',
            isInitialLoad: true,
            updatedContentCount: 0,
            message: 'Loaded All Contents Successfully'
          }
        }));
      } else if (totalUpdatedContentCount > 0) {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'success',
            isInitialLoad: false,
            updatedContentCount: totalUpdatedContentCount,
            message: `${totalUpdatedContentCount} content updated`
          }
        }));
      } else if (manual) {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'up-to-date',
            isInitialLoad: false,
            updatedContentCount: 0,
            message: 'Data is up to date'
          }
        }));
      }

      return {
        updated: updatedSomething,
        updatedCount: isLibraryEmpty ? 0 : totalUpdatedContentCount,
        isInitialLoad: isLibraryEmpty && updatedSomething,
        message: (isLibraryEmpty && updatedSomething)
          ? 'Loaded All Contents Successfully'
          : totalUpdatedContentCount > 0
            ? `${totalUpdatedContentCount} content updated`
            : 'Data is up to date',
        isRelaxed: false
      };
    } catch (error) {
      console.error("Error in quickRefreshCatalog:", error);
      if (manual) {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'up-to-date',
            isInitialLoad: false,
            updatedContentCount: 0,
            message: 'Data is up to date'
          }
        }));
      }
      return {
        updated: false,
        updatedCount: 0,
        message: 'Data is up to date',
        isRelaxed: false,
        isInitialLoad: false
      };
    }
  };

  const saveContentInternal = async (content: Content, localOnly = false) => {
    const isAdminOrEditor = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');

    const existing = contentList.find(c => c.id === content.id);
    const isNewItem = !existing;

    if (!isNewItem && isContentDataEqual(existing, content)) {
      setContentList(prev => {
        const idx = prev.findIndex(c => c.id === content.id);
        if (idx === -1) return prev;
        const newList = [...prev];
        newList[idx] = { ...content, chunkId: content.chunkId || existing.chunkId };
        return newList;
      });
      return;
    }

    if (isNewItem && isAdminOrEditor) {
      const createdStr = safeStorage.getItem('pending_created_items') || '[]';
      const createdSet = new Set(JSON.parse(createdStr));
      createdSet.add(content.id);
      safeStorage.setItem('pending_created_items', JSON.stringify(Array.from(createdSet)));
    }

    const { cleanContentForChunk } = await import('../utils/chunkUtils');
    const minified = cleanContentForChunk(content);
    let chunkId = content.chunkId;
    const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
    let localMeta: Record<string, any> = {};
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
        // Assigning new/unedited content to first chunk initially without chunk size checking.
        // Chunk sizes are strictly verified and rebalanced during sync (finalizeChanges -> autoRebalanceChunks).
        chunkId = `${prefix}0`;
        if (!localMeta[chunkId]) localMeta[chunkId] = { version: Date.now(), count: 0 };
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

                            const pendingItemsStr = safeStorage.getItem('pending_item_updates') || '{}';
                            const pendingItemsMap = JSON.parse(pendingItemsStr);
                            if (!pendingItemsMap[cid]) pendingItemsMap[cid] = [];
                            if (!pendingItemsMap[cid].includes(content.id)) pendingItemsMap[cid].push(content.id);
                            safeStorage.setItem('pending_item_updates', JSON.stringify(pendingItemsMap));
                            
                            const extMeta = localMeta[cid];
                            localMeta[cid] = { version: Date.now(), count: Object.keys(items).length };
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
    localMeta[chunkId] = { version: Date.now(), count: Object.keys(newChunkItems).length };
    safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));

    if (isAdminOrEditor) {
        const pendingStr = safeStorage.getItem('pending_chunk_updates') || '[]';
        const pendingIds = new Set(JSON.parse(pendingStr));
        pendingIds.add(chunkId);
        safeStorage.setItem('pending_chunk_updates', JSON.stringify(Array.from(pendingIds)));

        const pendingItemsStr = safeStorage.getItem('pending_item_updates') || '{}';
        const pendingItemsMap = JSON.parse(pendingItemsStr);
        if (!pendingItemsMap[chunkId]) pendingItemsMap[chunkId] = [];
        if (!pendingItemsMap[chunkId].includes(content.id)) pendingItemsMap[chunkId].push(content.id);
        safeStorage.setItem('pending_item_updates', JSON.stringify(pendingItemsMap));

        setHasPendingChanges(checkHasPendingChanges());
    }
    setContentList(prev => {
        const idx = prev.findIndex(c => c.id === content.id);
        const newList = [...prev];
        if (idx !== -1) newList[idx] = { ...content, chunkId };
        else newList.push({ ...content, chunkId });
        const sorted = newList.sort((a, b) => (b.order || 0) - (a.order || 0));
        safeStorage.setItem('content_cache', JSON.stringify(sorted));
        return sorted;
    });
    if (!localOnly && !isAdminOrEditor) {
        const { saveContentToChunk } = await import('../utils/chunkUtils');
        await saveContentToChunk(content);
    }
  };

  const updateOrder = async (updates: {id: string, order: number}[]) => {
    const validUpdates = updates.filter(u => {
        const item = contentList.find(c => c.id === u.id);
        return item && item.order !== u.order;
    });

    if (validUpdates.length > 0) {
        const formattedUpdates = validUpdates.map(u => ({
            id: u.id,
            fields: { order: u.order }
        }));
        await updateContentFields(formattedUpdates);
    }
  };

  const saveContent = (content: Content) => saveContentInternal(content);

  const updateContentFields = async (updates: { id: string, fields: Partial<Content>, chunkId?: string }[]) => {
    const isAdminOrEditor = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');

    const meaningfulUpdates = updates.filter(u => {
        const item = contentList.find(c => c.id === u.id);
        if (!item) return true;
        return Object.entries(u.fields).some(([key, val]) => {
            const norm1 = normalizeDataForComparison(item[key as keyof Content]);
            const norm2 = normalizeDataForComparison(val);
            return norm1 !== norm2;
        });
    });

    if (meaningfulUpdates.length === 0) {
        return;
    }

    const affectedChunkIds = new Set<string>();
    const { minifyContent } = await import('../utils/chunkUtils');

    // Group updates by chunkId to avoid O(N*M) repeated JSON stringifying/parsing
    const chunkUpdates: Record<string, typeof meaningfulUpdates> = {};

    let localMeta: Record<string, any> = {};
    const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
    try { localMeta = JSON.parse(localMetaString); } catch(e) {}

    for (const update of meaningfulUpdates) {
        let chunkId = update.chunkId;
        if (!chunkId) {
            chunkId = contentList.find(c => c.id === update.id)?.chunkId;
        }
        if (!chunkId) {
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
        if (!chunkUpdates[chunkId]) {
            chunkUpdates[chunkId] = [];
        }
        chunkUpdates[chunkId].push(update);
    }

    for (const chunkId of Object.keys(chunkUpdates)) {
        const chunkStr = safeStorage.getItem('content_chunk_' + chunkId);
        if (chunkStr) {
            const items = JSON.parse(chunkStr);
            const chunkSpecificUpdates = chunkUpdates[chunkId];

            chunkSpecificUpdates.forEach((update) => {
                if (items[update.id]) {
                    const minifiedPayload = minifyContent(update.fields);
                    const updatedItem = { ...items[update.id], ...minifiedPayload };
                    
                    // Clean empty values to save chunk space
                    Object.keys(updatedItem).forEach(key => {
                        const val = updatedItem[key];
                        if (val === null || val === undefined || val === '' || val === false || val === '[]') {
                            delete updatedItem[key];
                        } else if (Array.isArray(val) && val.length === 0) {
                            delete updatedItem[key];
                        }
                    });
                    
                    items[update.id] = updatedItem;
                }
            });

            safeStorage.setItem('content_chunk_' + chunkId, JSON.stringify(items));
            // Update local metadata immediately
            localMeta[chunkId] = { version: Date.now(), count: Object.keys(items).length };
        }
    }
    
    // Save metadata back
    safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));

    if (isAdminOrEditor && affectedChunkIds.size > 0) {
        const pendingStr = safeStorage.getItem('pending_chunk_updates') || '[]';
        const pendingIds = new Set(JSON.parse(pendingStr));
        affectedChunkIds.forEach(cid => pendingIds.add(cid));
        safeStorage.setItem('pending_chunk_updates', JSON.stringify(Array.from(pendingIds)));

        const pendingItemsStr = safeStorage.getItem('pending_item_updates') || '{}';
        const pendingItemsMap = JSON.parse(pendingItemsStr);
        Object.keys(chunkUpdates).forEach(cid => {
            if (!pendingItemsMap[cid]) pendingItemsMap[cid] = [];
            chunkUpdates[cid].forEach(u => {
                if (!pendingItemsMap[cid].includes(u.id)) pendingItemsMap[cid].push(u.id);
            });
        });
        safeStorage.setItem('pending_item_updates', JSON.stringify(pendingItemsMap));

        setHasPendingChanges(checkHasPendingChanges());
    }

    setContentList(prev => {
        const next = [...prev];
        meaningfulUpdates.forEach(u => {
            const idx = next.findIndex(c => c.id === u.id);
            if (idx !== -1) next[idx] = { ...next[idx], ...u.fields };
        });
        safeStorage.setItem('content_cache', JSON.stringify(next));
        return next;
    });

    if (!isAdminOrEditor) {
        const { updateContentFieldsInChunks } = await import('../utils/chunkUtils');
        await updateContentFieldsInChunks(meaningfulUpdates);
    }
  };

  const deleteMultipleContents = async (items: { id: string, chunkId?: string }[]) => {
    if (!items || items.length === 0) return;

    const isAdminOrEditor = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');
    const idsToDelete = new Set(items.map(i => i.id));

    let localMeta: Record<string, any> = {};
    const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
    try { localMeta = JSON.parse(localMetaString); } catch(e) {}

    const createdStr = safeStorage.getItem('pending_created_items') || '[]';
    const createdSet = new Set(JSON.parse(createdStr));
    let createdSetChanged = false;

    for (const id of idsToDelete) {
        if (createdSet.has(id)) {
            createdSet.delete(id);
            createdSetChanged = true;
        }
    }
    if (createdSetChanged) {
        safeStorage.setItem('pending_created_items', JSON.stringify(Array.from(createdSet)));
    }

    const affectedChunkIds = new Set<string>();

    // Scan ALL local storage chunk keys to thoroughly purge deleted items from local storage
    const allStorageKeys = Object.keys(localStorage);
    const chunkKeys = allStorageKeys.filter(k => 
        k.startsWith('content_chunk_') || 
        k.startsWith('movie_chunk_') || 
        k.startsWith('series_chunk_')
    );

    for (const key of chunkKeys) {
        const chunkStr = safeStorage.getItem(key);
        if (!chunkStr) continue;
        try {
            const chunkItems = JSON.parse(chunkStr);
            let modified = false;
            for (const id of idsToDelete) {
                if (chunkItems[id] !== undefined) {
                    delete chunkItems[id];
                    modified = true;
                }
            }
            if (modified) {
                safeStorage.setItem(key, JSON.stringify(chunkItems));
                const cid = key.startsWith('content_chunk_') ? key.replace('content_chunk_', '') : key;
                affectedChunkIds.add(cid);
                localMeta[cid] = { version: Date.now(), count: Object.keys(chunkItems).length };
            }
        } catch(e) {}
    }

    // Add any explicit chunk IDs passed in items or found in current content list
    for (const item of items) {
        const cid = item.chunkId || contentList.find(c => c.id === item.id)?.chunkId;
        if (cid) {
            affectedChunkIds.add(cid);
        }
    }

    safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));

    if (isAdminOrEditor && affectedChunkIds.size > 0) {
        const pendingStr = safeStorage.getItem('pending_chunk_updates') || '[]';
        const pendingIds = new Set(JSON.parse(pendingStr));
        affectedChunkIds.forEach(cid => pendingIds.add(cid));
        safeStorage.setItem('pending_chunk_updates', JSON.stringify(Array.from(pendingIds)));

        const pendingItemsStr = safeStorage.getItem('pending_item_updates') || '{}';
        const pendingItemsMap = JSON.parse(pendingItemsStr);
        affectedChunkIds.forEach(cid => {
            if (!pendingItemsMap[cid]) pendingItemsMap[cid] = [];
            idsToDelete.forEach(id => {
                if (!pendingItemsMap[cid].includes(id)) pendingItemsMap[cid].push(id);
            });
        });
        safeStorage.setItem('pending_item_updates', JSON.stringify(pendingItemsMap));
    }

    // Immediately remove from contentList state & content_cache
    setContentList(prev => {
        const next = prev.filter(c => !idsToDelete.has(c.id));
        safeStorage.setItem('content_cache', JSON.stringify(next));
        return next;
    });

    const hasPending = checkHasPendingChanges();
    setHasPendingChanges(hasPending);
    if (!hasPending) {
        safeStorage.removeItem('pending_chunk_updates');
        safeStorage.removeItem('pending_item_updates');
        safeStorage.removeItem('pending_created_items');
    }

    // Directly delete from Firestore chunks for non-admin/editor users (admins and editors use pending changes)
    if (!isAdminOrEditor) {
        try {
            const { deleteContentsFromChunks } = await import('../utils/chunkUtils');
            await deleteContentsFromChunks(items);
        } catch(e) {
            console.error("Error deleting from Firestore chunks:", e);
        }
    }
  };

  const updateAuxiliaryCollection = async (type: 'genre' | 'language' | 'quality', items: any[]) => {
    if (!['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '')) return;
    const cacheKey = type === 'quality' ? 'qualities_cache' : `${type}s_cache`;
    
    // items should already correctly have their 'order' values adjusted by the caller
    safeStorage.setItem(cacheKey, JSON.stringify(items));
    if (type === 'genre') setGenres(items);
    if (type === 'language') setLanguages(items);
    if (type === 'quality') setQualities(items);
    
    safeStorage.setItem('pending_metadata_updates', 'true');
    setHasPendingChanges(checkHasPendingChanges());
  };

  const bumpCollectionsVersion = async () => {
    // No longer bumping directly to server, handled via finalizeChanges for consistency
    setHasPendingChanges(checkHasPendingChanges());
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
    const cacheKey = type === 'quality' ? 'qualities_cache' : `${type}s_cache`;
    let current = JSON.parse(safeStorage.getItem(cacheKey) || '[]');
    const newItem = { ...item, id: item.id || Date.now().toString() };
    current.push(newItem);
    
    safeStorage.setItem(cacheKey, JSON.stringify(current));
    if (type === 'genre') setGenres(current);
    if (type === 'language') setLanguages(current);
    if (type === 'quality') setQualities(current);
    
    safeStorage.setItem('pending_metadata_updates', 'true');
    setHasPendingChanges(true);
  };

  const updateAuxiliaryItem = async (type: 'genre' | 'language' | 'quality', id: string, updates: any) => {
    if (!['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '')) return;
    const cacheKey = type === 'quality' ? 'qualities_cache' : `${type}s_cache`;
    let current = JSON.parse(safeStorage.getItem(cacheKey) || '[]');
    const idx = current.findIndex((i: any) => i.id === id);
    if (idx !== -1) {
        current[idx] = { ...current[idx], ...updates };
        safeStorage.setItem(cacheKey, JSON.stringify(current));
        
        if (type === 'genre') setGenres(current);
        if (type === 'language') setLanguages(current);
        if (type === 'quality') setQualities(current);
        
        safeStorage.setItem('pending_metadata_updates', 'true');
        setHasPendingChanges(true);
    }
  };

  const deleteAuxiliaryItem = async (type: 'genre' | 'language' | 'quality', id: string) => {
    if (!['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '')) return;
    const cacheKey = type === 'quality' ? 'qualities_cache' : `${type}s_cache`;
    let current = JSON.parse(safeStorage.getItem(cacheKey) || '[]');
    current = current.filter((i: any) => i.id !== id);
    
    safeStorage.setItem(cacheKey, JSON.stringify(current));
    if (type === 'genre') setGenres(current);
    if (type === 'language') setLanguages(current);
    if (type === 'quality') setQualities(current);
    
    safeStorage.setItem('pending_metadata_updates', 'true');
    setHasPendingChanges(true);
  };

  const deleteContent = async (id: string, chunkId?: string) => {
    await deleteMultipleContents([{ id, chunkId }]);
  };

  const getContent = async (id: string): Promise<Content | null> => {
    const item = contentList.find(c => c.id === id);
    if (!item) return null;
    const isFull = !(item as any)._isMinimal;
    if (isFull) return item;
    let chunkId = item.chunkId;
    if (!chunkId) {
        const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
        let localMeta: Record<string, any> = {};
        try { localMeta = JSON.parse(localMetaString); } catch(e) {}
        for (const cid of Object.keys(localMeta)) {
            const chunkStr = safeStorage.getItem('content_chunk_' + cid);
            if (chunkStr && chunkStr.includes(`"${id}"`)) {
                chunkId = cid;
                break;
            }
        }
    }
    if (!chunkId) return item;
    try {
      let chunkStr = safeStorage.getItem('content_chunk_' + chunkId);
      if (!chunkStr) {
         const chunkDoc = await getDoc(doc(db, 'content_chunks', chunkId));
         if (chunkDoc.exists()) {
             const items = chunkDoc.data().items || {};
             chunkStr = JSON.stringify(items);
             safeStorage.setItem('content_chunk_' + chunkId, chunkStr);
         }
      }
      if (chunkStr) {
         const items = JSON.parse(chunkStr);
         if (items[id]) {
            const expanded = expandContent({ ...items[id], id }, chunkId);
            expanded.order = item.order;
            return expanded;
         }
      }
    } catch(e) {
      console.error("Failed to fetch chunk on demand:", e);
    }
    return item;
  };

  return (
    <ContentContext.Provider value={{ 
        contentList: augmentedContentList, genres, languages, qualities, collections, loading, isOffline, 
        updateOrder, getContent, saveContent, deleteContent, updateContentFields, deleteMultipleContents, 
        updateAuxiliaryCollection, addCollection, updateCollection, deleteCollection, reorderCollections,
        addAuxiliaryItem, updateAuxiliaryItem, deleteAuxiliaryItem, finalizeChanges, hasPendingChanges, checkForUpdates,
        quickRefreshCatalog
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
