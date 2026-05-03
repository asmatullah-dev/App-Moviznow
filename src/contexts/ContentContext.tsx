import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { db, auth } from '../firebase';
import { safeStorage } from '../utils/safeStorage';
import { expandContent } from '../utils/chunkUtils';
import { collection, onSnapshot, query, where, getDocs, doc, setDoc, orderBy, limit, getDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { useUsers } from './UsersContext';
import { Content, Genre, Language, Quality, Collection as AppCollection } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { saveSearchIndexToChunks } from '../utils/chunkUtils';

interface ContentContextType {
  contentList: Content[];
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
  collections: AppCollection[];
  loading: boolean;
  isOffline: boolean;
  updateSearchIndex: () => Promise<void>;
  updateOrder: (updates: {id: string, order: number}[]) => void;
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export function ContentProvider({ children }: { children: React.ReactNode }) {
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
    const hasCache = safeStorage.getItem('content_cache') || 
                     safeStorage.getItem('genres_cache') || 
                     safeStorage.getItem('languages_cache') || 
                     safeStorage.getItem('qualities_cache') ||
                     safeStorage.getItem('collections_cache');
    return !hasCache;
  });
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

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

  const { profile, loading: authProfileLoading } = useAuth();
  const { users: allUsers } = useUsers();

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

  // Main listener for content
  useEffect(() => {
    if (authProfileLoading) return;
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    const isAdminOrEditor = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');
    let unsubContent: (() => void) | undefined = undefined;

    const setupListener = async () => {
      if (isAdminOrEditor) {
        const q = doc(db, 'chunk_meta', 'versions');
        unsubContent = onSnapshot(q, async (snapshot) => {
          let versions = snapshot.data() || {};
          
          if (Object.keys(versions).length === 0) {
            try {
              const chunksSnap = await getDocs(collection(db, 'content_chunks'));
              const newVersions: Record<string, number> = {};
              chunksSnap.docs.forEach(d => {
                newVersions[d.id] = Date.now();
                safeStorage.setItem('content_chunk_' + d.id, JSON.stringify(d.data().items || {}));
              });
              versions = newVersions;
            } catch(e) {
              console.error("Failed to bootstrap chunks", e);
            }
          }

          let localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
          let localMeta: Record<string, number> = {};
          try {
             localMeta = JSON.parse(localMetaString);
          } catch(e) {}
          
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
          
          const rawContentMap: Record<string, Content> = {};
          for (const chunkId of Object.keys(versions)) {
              const chunkStr = safeStorage.getItem('content_chunk_' + chunkId);
              if (chunkStr) {
                  try {
                      const items = JSON.parse(chunkStr);
                      Object.values(items).forEach((item: any) => {
                          const expanded = expandContent(item, chunkId);
                          rawContentMap[expanded.id] = expanded;
                      });
                  } catch(e) {}
              }
          }
          const rawContent = Object.values(rawContentMap);
          
          // Merge order from search index into chunks since it's removed from chunks
          try {
            const indexSnap = await getDocs(collection(db, 'search_index_chunks'));
            if (!indexSnap.empty) {
              const allData: string[] = [];
              const docs = [...indexSnap.docs].sort((a, b) => a.id.localeCompare(b.id));
              docs.forEach(d => { if (d.data().data) allData.push(...d.data().data); });
              
              const orderMap: Record<string, number> = {};
              allData.forEach(item => {
                const parts = item.split('|');
                const id = parts[0];
                const order = parts[9];
                if (order) orderMap[id] = parseInt(order, 10);
              });
              
              rawContent.forEach(c => {
                if (orderMap[c.id] !== undefined) {
                  c.order = orderMap[c.id];
                }
              });
            }
          } catch(e) {
             console.error("Error merging order from search index", e);
          }
          
          try {
            // Priority: save FULL data in cache for admins
            if (isAdminOrEditor) {
              safeStorage.setItem('content_cache', JSON.stringify(rawContent));
            } else {
              // For non-admins, always prefer sanitized version to save space
              throw new Error("Force sanitization for non-admins");
            }
          } catch (e) {
            // Failover to sanitized cache if localStorage is full or if user is not admin
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
              // For admins, we try to preserve links if we can, but if we reached here it means it's full.
              return { 
                ...c, 
                movieLinks: undefined, 
                seasons: minimalSeasons.length > 0 ? minimalSeasons : undefined,
                _isMinimal: true
              };
            });
            safeStorage.setItem('content_cache', JSON.stringify(sanitized));
          }
          
          setContentList(rawContent);
          setLoading(false);
        }, (error) => {
          console.error("Admin content error:", error);
          handleFirestoreError(error, OperationType.GET, 'chunk_meta');
          setLoading(false);
        });
      } else {
        // User Path
        const fetchUserContent = async () => {
          try {
            const indexSnap = await getDocs(collection(db, 'search_index_chunks'));
            if (!indexSnap.empty) {
              const allData: string[] = [];
              const docs = [...indexSnap.docs].sort((a, b) => a.id.localeCompare(b.id));
              docs.forEach(d => { if (d.data().data) allData.push(...d.data().data); });
              
              const parsed = allData.map(item => {
                const [id, title, year, posterUrl, type, qualityId, langIds, genreIds, createdAt, order, seasonsInfo] = item.split('|');
                return {
                  id, title, year: parseInt(year), posterUrl, type: type as 'movie' | 'series', 
                  qualityId, languageIds: langIds ? langIds.split(',') : [],
                  genreIds: genreIds ? genreIds.split(',') : [],
                  createdAt, order: order ? parseInt(order) : undefined,
                  seasonsCountText: seasonsInfo, 
                  status: 'published'
                } as unknown as Content;
              });

              safeStorage.setItem('content_cache', JSON.stringify(parsed));
              setContentList(parsed);
              setLoading(false);
            }
          } catch (e) {
            console.error("User content error:", e);
            setLoading(false);
          }
        };
        fetchUserContent();
        const tid = setInterval(fetchUserContent, 10 * 60 * 1000);
        unsubContent = () => clearInterval(tid);
      }
    };

    setupListener();
    return () => { if (unsubContent) unsubContent(); };
  }, [profile?.role, authProfileLoading]);

  // Static Data Listeners (Genres, Languages, etc.)
  useEffect(() => {
    if (authProfileLoading) return;
    if (!navigator.onLine) return;

    const isAdmin = ['owner', 'admin', 'content_manager', 'manager'].includes(profile?.role || '');
    let unsubs: (() => void)[] = [];

    if (isAdmin) {
      unsubs.push(onSnapshot(collection(db, 'genres'), snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Genre)).sort((a, b) => (a.order || 0) - (b.order || 0));
        setGenres(data); safeStorage.setItem('genres_cache', JSON.stringify(data));
      }));
      unsubs.push(onSnapshot(collection(db, 'languages'), snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Language)).sort((a, b) => (a.order || 0) - (b.order || 0));
        setLanguages(data); safeStorage.setItem('languages_cache', JSON.stringify(data));
      }));
      unsubs.push(onSnapshot(collection(db, 'qualities'), snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Quality)).sort((a, b) => (a.order || 0) - (b.order || 0));
        setQualities(data); safeStorage.setItem('qualities_cache', JSON.stringify(data));
      }));
      unsubs.push(onSnapshot(collection(db, 'collections'), snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppCollection)).sort((a, b) => (a.order || 0) - (b.order || 0));
        setCollections(data); safeStorage.setItem('collections_cache', JSON.stringify(data));
      }));
    } else {
      // Users just fetch once or use cache
      const fetchStatic = async () => {
        try {
          const [g, l, q, c] = await Promise.all([
            getDocs(collection(db, 'genres')), getDocs(collection(db, 'languages')),
            getDocs(collection(db, 'qualities')), getDocs(collection(db, 'collections'))
          ]);
          const gd = g.docs.map(d => ({ id: d.id, ...d.data() } as Genre)).sort((a, b) => (a.order || 0) - (b.order || 0));
          const ld = l.docs.map(d => ({ id: d.id, ...d.data() } as Language)).sort((a, b) => (a.order || 0) - (b.order || 0));
          const qd = q.docs.map(d => ({ id: d.id, ...d.data() } as Quality)).sort((a, b) => (a.order || 0) - (b.order || 0));
          const cd = c.docs.map(d => ({ id: d.id, ...d.data() } as AppCollection)).sort((a, b) => (a.order || 0) - (b.order || 0));
          
          setGenres(gd); setLanguages(ld); setQualities(qd); setCollections(cd);
          safeStorage.setItem('genres_cache', JSON.stringify(gd));
          safeStorage.setItem('languages_cache', JSON.stringify(ld));
          safeStorage.setItem('qualities_cache', JSON.stringify(qd));
          safeStorage.setItem('collections_cache', JSON.stringify(cd));
        } catch(err) {}
      };
      fetchStatic();
    }

    return () => unsubs.forEach(u => u());
  }, [profile?.role, authProfileLoading]);

  const lastSearchIndexRef = useRef<string>('');

  const updateSearchIndex = async () => {
    if (contentList.length === 0) return;
    
    // Safeguard: Do not update search index if the list is suspiciously small 
    // compared to previous state, unless explicitly forced or empty initially.
    const cachedStr = safeStorage.getItem('content_cache');
    if (cachedStr) {
      try {
        const cached = JSON.parse(cachedStr);
        if (Array.isArray(cached) && cached.length > 50 && contentList.length < cached.length * 0.5) {
          console.warn(`[Safeguard] Potential index pruning detected. Current: ${contentList.length}, Cached: ${cached.length}. Skipping update.`);
          return;
        }
      } catch (e) {}
    }

    const published = contentList.filter(c => c.status === 'published');
    
    let maxOrder = -1;
    published.forEach(c => {
      if (c.order !== undefined && c.order > maxOrder) maxOrder = c.order;
    });

    published.forEach(c => {
      if (c.order === undefined) {
        maxOrder++;
        c.order = maxOrder;
      }
    });

    published.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    const index = published.map(c => {
      let seasonsInfoStr = '';
      if (c.type === 'series' && c.seasons) {
        try {
          const s = Array.isArray(c.seasons) ? c.seasons : JSON.parse(c.seasons as string);
          if (s.length > 1) {
            seasonsInfoStr = `S:${s.length}`;
          } else if (s.length === 1 && s[0].episodes) {
            seasonsInfoStr = `E:${s[0].episodes.length}`;
          }
        } catch(e) {}
      }
      return `${c.id}|${c.title}|${c.year}||${c.type}|${c.qualityId || ''}|${c.languageIds?.join(',') || ''}|${c.genreIds?.join(',') || ''}|${c.createdAt}|${c.order || 0}|${seasonsInfoStr}`;
    });

    const indexStr = JSON.stringify(index);
    if (indexStr === lastSearchIndexRef.current) return;

    try {
      await saveSearchIndexToChunks(index);
      lastSearchIndexRef.current = indexStr;
    } catch (e) {}
  };

  useEffect(() => {
    if (profile?.role === 'owner' && contentList.length > 0 && navigator.onLine) {
      const t = setTimeout(updateSearchIndex, 10000); // 10s debounce
      return () => clearTimeout(t);
    }
  }, [contentList, profile?.role]);

  const updateOrder = (updates: {id: string, order: number}[]) => {
    setContentList(prev => {
      const newList = [...prev];
      const updateMap = new Map(updates.map(u => [u.id, u.order]));
      newList.forEach(item => {
        if (updateMap.has(item.id)) {
          item.order = updateMap.get(item.id);
        }
      });
      return newList;
    });
  };

  return (
    <ContentContext.Provider value={{ contentList: augmentedContentList, genres, languages, qualities, collections, loading, isOffline, updateSearchIndex, updateOrder }}>
      {children}
    </ContentContext.Provider>
  );
}

export const useContent = () => {
  const context = useContext(ContentContext);
  if (context === undefined) throw new Error('useContent must be used within a ContentProvider');
  return context;
};
