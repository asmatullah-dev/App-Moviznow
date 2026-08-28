import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import {
  getCachedContentData,
  isStaticExportNewer,
  mergeStaticExportDataSafely,
  getStaticExportContent,
  getStaticExportMetadata,
  getStaticExportCollections
} from '../utils/staticContentLoader';
import { Content, Genre, Language, Quality, Collection as AppCollection } from '../types';
import { expandContent, findLocalChunkForContent } from '../utils/chunkUtils';
import { safeStorage } from '../utils/safeStorage';

interface ContentContextType {
  contentList: Content[];
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
  collections: AppCollection[];
  loading: boolean;
  isOffline: boolean;
  getContent: (id: string) => Promise<Content | null>;
  checkForUpdates: (force?: boolean) => Promise<{ updated: boolean; updatedContentCount: number; isInitialLoad?: boolean }>;
  quickRefreshCatalog: (manual?: boolean, prefetchedVersions?: Record<string, any>, forceAdminSync?: boolean) => Promise<{ updated: boolean; updatedCount: number; message: string; isRelaxed?: boolean; isInitialLoad?: boolean }>;
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export function ContentProvider({ children }: { children: React.ReactNode }) {
  // 1. Immediately initialize from cache synchronously to guarantee zero delay on app open
  const initialData = useMemo(() => getCachedContentData(), []);

  const [contentList, setContentList] = useState<Content[]>(initialData.contentList);
  const [genres, setGenres] = useState<Genre[]>(initialData.genres);
  const [languages, setLanguages] = useState<Language[]>(initialData.languages);
  const [qualities, setQualities] = useState<Quality[]>(initialData.qualities);
  const [collections, setCollections] = useState<AppCollection[]>(initialData.collections);
  const [loading, setLoading] = useState<boolean>(!initialData.hasCache || initialData.contentList.length === 0);

  // Background check: only merge if the static export JSON file is newer than the cache
  useEffect(() => {
    if (isStaticExportNewer()) {
      try {
        const merged = mergeStaticExportDataSafely();
        setContentList(merged.contentList);
        setGenres(merged.genres);
        setLanguages(merged.languages);
        setQualities(merged.qualities);
        setCollections(merged.collections);
      } catch (e) {
        console.error("Error safely merging newer JSON export:", e);
      }
    }
    setLoading(false);
  }, []);

  // Listen to local content updates (e.g., from Admin or background storage syncs)
  useEffect(() => {
    const handleLocalUpdate = () => {
      const cached = safeStorage.getItem('content_cache');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setContentList(parsed);
          }
        } catch (e) {}
      }
      const g = safeStorage.getItem('genres_cache');
      if (g) try { setGenres(JSON.parse(g)); } catch(e) {}
      const l = safeStorage.getItem('languages_cache');
      if (l) try { setLanguages(JSON.parse(l)); } catch(e) {}
      const q = safeStorage.getItem('qualities_cache');
      if (q) try { setQualities(JSON.parse(q)); } catch(e) {}
      const c = safeStorage.getItem('collections_cache');
      if (c) try { setCollections(JSON.parse(c)); } catch(e) {}
    };

    window.addEventListener('content_updated_locally', handleLocalUpdate);
    return () => window.removeEventListener('content_updated_locally', handleLocalUpdate);
  }, []);

  const getContent = async (id: string): Promise<Content | null> => {
    // 1. Check in state
    const foundInState = contentList.find(c => c.id === id);
    if (foundInState && (foundInState.movieLinks || foundInState.seasons)) {
      return foundInState;
    }

    // 2. Check in local chunk storage
    const localChunkId = findLocalChunkForContent(id);
    if (localChunkId) {
      const chunkStr = safeStorage.getItem(`content_chunk_${localChunkId}`) || safeStorage.getItem(localChunkId);
      if (chunkStr) {
        try {
          const items = JSON.parse(chunkStr);
          if (items[id]) {
            return expandContent({ ...items[id], id }, localChunkId);
          }
        } catch (e) {}
      }
    }

    // 3. Fallback to static export data
    const staticContent = getStaticExportContent();
    const staticItem = staticContent.find(s => s.id === id);
    if (staticItem) {
      const chunkId = staticItem.chunkId || (staticItem.type === 'movie' ? 'movie_chunk_0' : 'series_chunk_0');
      const expanded = expandContent({ ...staticItem, id }, chunkId);
      if (foundInState?.order !== undefined) expanded.order = foundInState.order;
      return expanded;
    }

    return foundInState || null;
  };

  const checkForUpdates = async () => ({ updated: false, updatedContentCount: 0 });

  const quickRefreshCatalog = async () => {
    if (isStaticExportNewer()) {
      const merged = mergeStaticExportDataSafely();
      setContentList(merged.contentList);
      setGenres(merged.genres);
      setLanguages(merged.languages);
      setQualities(merged.qualities);
      setCollections(merged.collections);
      return { updated: true, updatedCount: merged.contentList.length, message: 'Catalog updated' };
    }
    return { updated: false, updatedCount: 0, message: 'Up to date' };
  };

  return (
    <ContentContext.Provider value={{
         contentList, genres, languages, qualities, collections, loading, isOffline: false,
         getContent, checkForUpdates, quickRefreshCatalog
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

export function isContentDataEqual(oldData: any, newData: any) {
    return JSON.stringify(oldData) === JSON.stringify(newData);
}
