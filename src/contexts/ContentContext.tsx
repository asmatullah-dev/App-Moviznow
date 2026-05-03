import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { db, auth } from '../firebase';
import { safeStorage } from '../utils/safeStorage';
import { expandContent } from '../utils/chunkUtils';
import { collection, onSnapshot, query, where, getDocs, doc, setDoc, orderBy, limit, getDoc } from 'firebase/firestore';
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
  updateOrder: (updates: {id: string, order: number}[]) => void;
  getContent: (id: string) => Promise<Content | null>;
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

    let unsubContent: (() => void) | undefined = undefined;

    const setupListener = async () => {
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
        rawContent.sort((a, b) => (a.order || 0) - (b.order || 0));

        const isAdminOrEditor = ['owner', 'admin', 'content_manager', 'editor', 'manager'].includes(profile?.role || '');
        
        try {
          if (isAdminOrEditor) {
            safeStorage.setItem('content_cache', JSON.stringify(rawContent));
          } else {
            throw new Error("Sanitize for users");
          }
        } catch (e) {
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
            return { 
              ...c, 
              movieLinks: undefined, 
              seasons: minimalSeasons.length > 0 ? minimalSeasons : undefined,
              _isMinimal: true
            };
          });
          safeStorage.setItem('content_cache', JSON.stringify(sanitized));
          // If the user isn't an admin, we might want to serve them the sanitized list to save memory, 
          // but the instruction says "use chunks... parse them and use in Every where", 
          // so I will keep rawContent as long as it fits in memory.
          // Actually, setContentList(rawContent) is fine.
        }
        
        setContentList(rawContent);
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

  const getContent = async (id: string): Promise<Content | null> => {
    const item = contentList.find(c => c.id === id);
    if (!item) return null;

    // If it has links or seasons, it's already full
    const isFull = !!item.movieLinks || (item.type === 'series' && item.seasons);
    if (isFull) return item;

    // Check localStorage for the chunk
    let chunkId = item.chunkId;
    
    // If chunkId is missing (e.g. from old index), we have to find it
    if (!chunkId) {
      // Fallback: try to find it by loading metadata or all chunks (admins only usually)
      // For users, it's better if the index has it.
      // If missing, we do a one-off scan of chunks (expensive but localized)
      const chunksSnap = await getDocs(collection(db, 'content_chunks'));
      for (const d of chunksSnap.docs) {
        if (d.data().items[id]) {
          chunkId = d.id;
          break;
        }
      }
    }

    if (!chunkId) return item; // Return lite if not found

    try {
      const chunkStr = safeStorage.getItem('content_chunk_' + chunkId);
      let items: any = null;
      if (chunkStr) {
        items = JSON.parse(chunkStr);
      } else {
        const chunkDoc = await getDoc(doc(db, 'content_chunks', chunkId));
        if (chunkDoc.exists()) {
          items = chunkDoc.data().items || {};
          safeStorage.setItem('content_chunk_' + chunkId, JSON.stringify(items));
        }
      }

      if (items && items[id]) {
        const expanded = expandContent(items[id], chunkId);
        // Merge order from Lite item
        expanded.order = item.order;
        
        // Update the list if needed
        setContentList(prev => {
          const idx = prev.findIndex(c => c.id === id);
          if (idx !== -1) {
            const newList = [...prev];
            newList[idx] = expanded;
            return newList;
          }
          return prev;
        });
        
        return expanded;
      }
    } catch (e) {
      console.error("Lazy load failed", e);
    }

    return item;
  };

  return (
    <ContentContext.Provider value={{ contentList: augmentedContentList, genres, languages, qualities, collections, loading, isOffline, updateOrder, getContent }}>
      {children}
    </ContentContext.Provider>
  );
}

export const useContent = () => {
  const context = useContext(ContentContext);
  if (context === undefined) throw new Error('useContent must be used within a ContentProvider');
  return context;
};
