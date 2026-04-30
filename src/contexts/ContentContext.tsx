import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { db, auth } from '../firebase';
import { safeStorage } from '../utils/safeStorage';
import { collection, onSnapshot, query, where, getDoc, getDocs, doc, setDoc, orderBy, limit } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
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
  updateSearchIndex: () => Promise<void>;
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

  const { profile } = useAuth();
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

  useEffect(() => {
    let unsubContent: () => void;
    
    const setupContentListener = async () => {
      if (unsubContent) unsubContent();

      if (!navigator.onLine) {
        setLoading(false);
        return;
      }

      const isAdminOrEditor = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'content_manager' || profile?.role === 'manager';

      if (isAdminOrEditor) {
        const q = collection(db, 'content');
        unsubContent = onSnapshot(q, (snapshot) => {
          const rawContent = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Content));
          
          try {
            const sanitizedContent = rawContent.map(c => {
              let minimalSeasons: any[] = [];
              if (c.seasons) {
                try {
                  const parsedSeasons = Array.isArray(c.seasons) ? c.seasons : JSON.parse(c.seasons as string);
                  minimalSeasons = parsedSeasons.map((s: any) => ({
                    seasonNumber: s.seasonNumber,
                    episodes: s.episodes && s.episodes.length > 0 ? [{ episodeNumber: s.episodes[s.episodes.length - 1].episodeNumber }] : []
                  }));
                } catch (e) {}
              }
              return {
                ...c,
                movieLinks: undefined,
                fullSeasonZip: undefined,
                fullSeasonMkv: undefined,
                seasons: minimalSeasons.length > 0 ? minimalSeasons : undefined
              };
            });
            safeStorage.setItem('content_cache', JSON.stringify(sanitizedContent));
          } catch (e) {
            console.error("Failed to save content cache", e);
          }
          
          setContentList(rawContent);
          setLoading(false);
        }, (error) => {
          console.error("Content snapshot error:", error);
          setLoading(false);
          if (navigator.onLine) {
            handleFirestoreError(error, OperationType.LIST, 'content');
          }
        });
      } else {
        let isMounted = true;
        
        const fetchUserContent = async () => {
          try {
            const indexDoc = await getDoc(doc(db, 'metadata', 'search_index'));
            if (indexDoc.exists()) {
              const data = indexDoc.data().data as string[];
              const parsedContent: Content[] = data.map(item => {
                const [id, title, year, posterUrl, type, qualityId, langIds, genreIds, createdAt, order, seasonsInfo] = item.split('|');
                const seasons = seasonsInfo ? seasonsInfo.split(',').map(s => {
                  const [sNum, lastEp] = s.split(':');
                  return {
                    id: `s${sNum}`,
                    seasonNumber: parseInt(sNum, 10),
                    episodes: lastEp ? [{ id: 'last', episodeNumber: parseInt(lastEp, 10), title: '', url: '' }] : []
                  };
                }) : [];

                return {
                  id, title, year, posterUrl, type: type as 'movie' | 'series', qualityId,
                  languageIds: langIds ? langIds.split(',') : [],
                  genreIds: genreIds ? genreIds.split(',') : [],
                  createdAt, order: (order !== undefined && order !== '') ? parseInt(order, 10) : undefined,
                  seasons, status: 'published', description: '', trailerUrl: '', cast: [], updatedAt: createdAt
                } as unknown as Content;
              });
              try {
                safeStorage.setItem('content_cache', JSON.stringify(parsedContent));
              } catch (e) {
                console.error("Failed to save content cache", e);
              }
              if (isMounted) {
                setContentList(parsedContent);
                setLoading(false);
              }
            } else {
              try {
                const q = query(collection(db, 'content'), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(50));
                const snapshot = await getDocs(q);
                if (isMounted) {
                  const rawContent = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Content));
                  const sanitizedContent = rawContent.map(c => {
                    let minimalSeasons: any[] = [];
                    if (c.seasons) {
                      try {
                        const parsedSeasons = Array.isArray(c.seasons) ? c.seasons : JSON.parse(c.seasons as string);
                        minimalSeasons = parsedSeasons.map((s: any) => ({
                          seasonNumber: s.seasonNumber,
                          episodes: s.episodes && s.episodes.length > 0 ? [{ episodeNumber: s.episodes[s.episodes.length - 1].episodeNumber }] : []
                        }));
                      } catch (e) {}
                    }
                    return {
                      ...c, movieLinks: undefined, fullSeasonZip: undefined, fullSeasonMkv: undefined,
                      seasons: minimalSeasons.length > 0 ? minimalSeasons : undefined
                    };
                  });
                  try {
                    safeStorage.setItem('content_cache', JSON.stringify(sanitizedContent));
                  } catch (e) {
                    console.error("Failed to save content cache", e);
                  }
                  setContentList(rawContent);
                  setLoading(false);
                }
              } catch (error) {
                console.error("Error fetching fallback content", error);
                if (isMounted) setLoading(false);
              }
            }
          } catch (error) {
            console.error("Search index fetch error:", error);
            if (isMounted) setLoading(false);
          }
        };

        fetchUserContent();
        const intervalId = setInterval(fetchUserContent, 10 * 60 * 1000); // 10 mins backoff for users
        unsubContent = () => {
          isMounted = false;
          clearInterval(intervalId);
        };
      }
    };

    setupContentListener();

    let unsubGenres: () => void;
    let unsubLanguages: () => void;
    let unsubQualities: () => void;
    let unsubCollections: () => void;

    const setupStaticDataListeners = async () => {
      if (!navigator.onLine) return;

      const isAdminOrEditor = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'content_manager' || profile?.role === 'manager';

      if (isAdminOrEditor) {
        unsubGenres = onSnapshot(collection(db, 'genres'), (snapshot) => {
          const genresData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Genre));
          genresData.sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
            if (a.order !== undefined) return -1;
            if (b.order !== undefined) return 1;
            return a.name.localeCompare(b.name);
          });
          safeStorage.setItem('genres_cache', JSON.stringify(genresData));
          setGenres(genresData);
        });

        unsubLanguages = onSnapshot(collection(db, 'languages'), (snapshot) => {
          const langsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Language));
          langsData.sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
            if (a.order !== undefined) return -1;
            if (b.order !== undefined) return 1;
            return a.name.localeCompare(b.name);
          });
          safeStorage.setItem('languages_cache', JSON.stringify(langsData));
          setLanguages(langsData);
        });

        unsubQualities = onSnapshot(collection(db, 'qualities'), (snapshot) => {
          const qualitiesData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Quality));
          qualitiesData.sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
            if (a.order !== undefined) return -1;
            if (b.order !== undefined) return 1;
            return a.name.localeCompare(b.name);
          });
          safeStorage.setItem('qualities_cache', JSON.stringify(qualitiesData));
          setQualities(qualitiesData);
        });

        unsubCollections = onSnapshot(collection(db, 'collections'), (snapshot) => {
          const collectionsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AppCollection));
          collectionsData.sort((a, b) => (a.order || 0) - (b.order || 0));
          safeStorage.setItem('collections_cache', JSON.stringify(collectionsData));
          setCollections(collectionsData);
        });
      } else {
        // For regular users, only fetch if cache is older than 24 hours or missing
        const lastSync = parseInt(safeStorage.getItem('static_data_synced_at') || '0', 10);
        const hasCache = safeStorage.getItem('genres_cache') && safeStorage.getItem('collections_cache');
        const now = Date.now();
        const needFetch = !hasCache || (now - lastSync > 24 * 60 * 60 * 1000);

        if (needFetch) {
          try {
            const [genresSnap, langsSnap, qualsSnap, collsSnap] = await Promise.all([
              getDocs(collection(db, 'genres')),
              getDocs(collection(db, 'languages')),
              getDocs(collection(db, 'qualities')),
              getDocs(collection(db, 'collections'))
            ]);

            const genresData = genresSnap.docs.map(d => ({ id: d.id, ...d.data() } as Genre));
            genresData.sort((a, b) => {
              if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
              if (a.order !== undefined) return -1;
              if (b.order !== undefined) return 1;
              return a.name.localeCompare(b.name);
            });
            safeStorage.setItem('genres_cache', JSON.stringify(genresData));
            setGenres(genresData);

            const langsData = langsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Language));
            langsData.sort((a, b) => {
              if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
              if (a.order !== undefined) return -1;
              if (b.order !== undefined) return 1;
              return a.name.localeCompare(b.name);
            });
            safeStorage.setItem('languages_cache', JSON.stringify(langsData));
            setLanguages(langsData);

            const qualitiesData = qualsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Quality));
            qualitiesData.sort((a, b) => {
              if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
              if (a.order !== undefined) return -1;
              if (b.order !== undefined) return 1;
              return a.name.localeCompare(b.name);
            });
            safeStorage.setItem('qualities_cache', JSON.stringify(qualitiesData));
            setQualities(qualitiesData);

            const collectionsData = collsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AppCollection));
            collectionsData.sort((a, b) => (a.order || 0) - (b.order || 0));
            safeStorage.setItem('collections_cache', JSON.stringify(collectionsData));
            setCollections(collectionsData);

            safeStorage.setItem('static_data_synced_at', now.toString());
          } catch (e) {
            console.error("Failed to fetch static data", e);
          }
        }
      }
    };

    setupStaticDataListeners();

    return () => { 
      if (unsubContent) unsubContent();
      if (unsubGenres) unsubGenres();
      if (unsubLanguages) unsubLanguages();
      if (unsubQualities) unsubQualities();
      if (unsubCollections) unsubCollections();
    };
  }, [profile?.role]);

  const lastSearchIndexRef = useRef<string>('');

  const updateSearchIndex = async () => {
    if (contentList.length === 0) return;
    
    const searchIndex = contentList.filter(c => c.status === 'published').map(c => {
      let seasons: any[] = [];
      if (c.seasons) {
        try {
          seasons = Array.isArray(c.seasons) ? c.seasons : JSON.parse(c.seasons as string);
        } catch (e) {
          console.error("Failed to parse seasons for search index", e);
        }
      }
      const seasonsInfo = seasons.map(s => {
        const lastEp = s.episodes && s.episodes.length > 0 ? s.episodes[s.episodes.length - 1].episodeNumber : '';
        return `${s.seasonNumber}:${lastEp}`;
      }).join(',') || '';
      
      return `${c.id}|${c.title}|${c.year}|${c.posterUrl}|${c.type}|${c.qualityId || ''}|${c.languageIds?.join(',') || ''}|${c.genreIds?.join(',') || ''}|${c.createdAt}|${c.order ?? ''}|${seasonsInfo}`;
    });

    const indexString = JSON.stringify(searchIndex);
    
    // Only write if the index has actually changed
    if (indexString === lastSearchIndexRef.current) {
      return;
    }

    try {
      await setDoc(doc(db, 'metadata', 'search_index'), { data: searchIndex });
      lastSearchIndexRef.current = indexString;
      console.log("Search index updated successfully (only changed content)");
    } catch (e) {
      console.error("Failed to update search_index", e);
    }
  };

  // Debounced search index update to prevent excessive writes
  useEffect(() => {
    const userId = auth.currentUser?.uid;
    // Don't trigger if offline or no user or empty list
    if (!userId || contentList.length === 0 || !navigator.onLine) return;

    let timer: NodeJS.Timeout;

    const checkRoleAndUpdate = async () => {
      try {
        // Only the owner should update the index to minimize writes
        // If no owner is online, the search index might lag, but most managing is done by owners.
        const isUpdater = profile?.role === 'owner';
        if (isUpdater) {
          // Debounce the update by 30 minutes to consolidate multiple changes
          timer = setTimeout(() => {
            updateSearchIndex();
          }, 30 * 60000);
        }
      } catch (e) {}
    };

    checkRoleAndUpdate();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [contentList, profile?.role]); // Changed from length to contentList for deeper check

  return (
    <ContentContext.Provider value={{ contentList: augmentedContentList, genres, languages, qualities, collections, loading, isOffline, updateSearchIndex }}>
      {children}
    </ContentContext.Provider>
  );
}

export const useContent = () => {
  const context = useContext(ContentContext);
  if (context === undefined) {
    throw new Error('useContent must be used within a ContentProvider');
  }
  return context;
}
