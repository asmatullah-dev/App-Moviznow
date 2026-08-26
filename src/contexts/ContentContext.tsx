import React, { createContext, useContext, useEffect, useState } from 'react';
import { seedStaticExportData, getStaticExportContent, getStaticExportMetadata, getStaticExportCollections } from '../utils/staticContentLoader';
import { Content, Genre, Language, Quality, Collection as AppCollection } from '../types';
import { expandContent } from '../utils/chunkUtils';
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
  const [contentList, setContentList] = useState<Content[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [collections, setCollections] = useState<AppCollection[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshFromLocal = () => {
    try {
      // 1. Seed static export data non-destructively
      seedStaticExportData();

      // 2. Base static content
      const staticContent = getStaticExportContent();
      const meta = getStaticExportMetadata();
      const colls = getStaticExportCollections();

      const itemMap: Record<string, Content> = {};

      // Load static items
      staticContent.forEach((item: any) => {
        const chunkId = item.chunkId || (item.type === 'movie' ? 'movie_chunk_0' : 'series_chunk_0');
        itemMap[item.id] = expandContent({ ...item, id: item.id }, chunkId);
      });

      const mergedList = Object.values(itemMap).sort((a, b) => (b.order || 0) - (a.order || 0));
      setContentList(mergedList);

      // Load auxiliary collections strictly from static metadata
      setGenres(meta.genres);
      setLanguages(meta.languages);
      setQualities(meta.qualities);
      setCollections(colls);

    } catch (e) {
      console.error("Error loading static content in ContentContext:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshFromLocal();
  }, []);

  const getContent = async (id: string): Promise<Content | null> => {
    // 1. Check in state
    const foundInState = contentList.find(c => c.id === id);
    if (foundInState && (foundInState.movieLinks || foundInState.seasons)) {
      return foundInState;
    }

    // 2. Fallback to static export data
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
    refreshFromLocal();
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
