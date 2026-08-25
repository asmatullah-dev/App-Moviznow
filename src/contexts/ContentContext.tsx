import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
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

  // Users ALWAYS read from static JSON (No Firebase)
  useEffect(() => {
    try {
      // 1. Seed into local storage
      seedStaticExportData();

      // 2. Load directly from the static unified data
      const staticContent = getStaticExportContent();
      const meta = getStaticExportMetadata();
      const colls = getStaticExportCollections();

      // Ensure minimal expansion for contentList
      const expandedList = staticContent.map((item: any) => {
         const chunkId = item.chunkId || (item.type === 'movie' ? 'movie_chunk_0' : 'series_chunk_0');
         return expandContent({ ...item, id: item.id }, chunkId);
      });

      setContentList(expandedList.sort((a, b) => (b.order || 0) - (a.order || 0)));
      setGenres(meta.genres);
      setLanguages(meta.languages);
      setQualities(meta.qualities);
      setCollections(colls);
      
    } catch (e) {
      console.error("Error loading JSON content:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const getContent = async (id: string): Promise<Content | null> => {
    return contentList.find(c => c.id === id) || null;
  };

  // No-ops for regular users (JSON-only mode doesn't fetch chunks)
  const checkForUpdates = async () => ({ updated: false, updatedContentCount: 0 });
  const quickRefreshCatalog = async () => ({ updated: false, updatedCount: 0, message: 'Up to date' });

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

// Exporting this for backwards compatibility where it was used
export function isContentDataEqual(oldData: any, newData: any) {
    return JSON.stringify(oldData) === JSON.stringify(newData);
}
