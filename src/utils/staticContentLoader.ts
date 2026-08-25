import unifiedData from '../data/moviznow_catalog_export.json';
import { safeStorage } from './safeStorage';

export interface StaticContentItem {
  id: string;
  chunkId?: string;
  type: string;
  title: string;
  [key: string]: any;
}

const staticContentData = unifiedData.content;
const staticMetadataData = unifiedData.metadata;
const staticCollectionsData = unifiedData.collections;

/**
 * Populates local storage chunks and metadata caches from static export JSON data.
 * Guarantees guest users and initial page loads have the entire 2,478 item content catalog
 * instantly available without needing any Firestore connection.
 */
export function seedStaticExportData(): void {
  try {
    // 1. Group content items by chunkId
    const chunkMap: Record<string, Record<string, any>> = {};
    const items = staticContentData as StaticContentItem[];

    for (const item of items) {
      const cId = item.chunkId || (item.type === 'movie' ? 'movie_chunk_0' : 'series_chunk_0');
      if (!chunkMap[cId]) {
        chunkMap[cId] = {};
      }
      chunkMap[cId][item.id] = item;
    }

    // 2. Write chunk objects into local storage
    const localMeta: Record<string, any> = {};
    for (const [chunkId, itemsObj] of Object.entries(chunkMap)) {
      const storageKey = 'content_chunk_' + chunkId;
      safeStorage.setItem(storageKey, JSON.stringify(itemsObj));
      localMeta[chunkId] = { version: 1, count: Object.keys(itemsObj).length };
    }

    // 3. Populate metadata (genres, languages, qualities)
    if (staticMetadataData.genres && staticMetadataData.genres.length > 0) {
      safeStorage.setItem('genres_cache', JSON.stringify(staticMetadataData.genres));
    }
    if (staticMetadataData.languages && staticMetadataData.languages.length > 0) {
      safeStorage.setItem('languages_cache', JSON.stringify(staticMetadataData.languages));
    }
    if (staticMetadataData.qualities && staticMetadataData.qualities.length > 0) {
      safeStorage.setItem('qualities_cache', JSON.stringify(staticMetadataData.qualities));
    }
    localMeta.metadata = 1;

    // 4. Populate collections
    if (staticCollectionsData.items && Object.keys(staticCollectionsData.items).length > 0) {
      const collItems = staticCollectionsData.items;
      safeStorage.setItem('local_collection_chunk_collection_chunk_0', JSON.stringify(collItems));
      const collList = Object.values(collItems).sort((a: any, b: any) => (b.order || 0) - (a.order || 0));
      safeStorage.setItem('collections_cache', JSON.stringify(collList));
    }
    localMeta.collections = 1;

    safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
    safeStorage.setItem('last_successful_meta_check', Date.now().toString());
  } catch (e) {
    console.error('Error seeding static export data:', e);
  }
}

/**
 * Returns static content items list directly.
 */
export function getStaticExportContent(): StaticContentItem[] {
  return staticContentData as StaticContentItem[];
}

export function getStaticExportMetadata() {
  return {
    genres: staticMetadataData.genres || [],
    languages: staticMetadataData.languages || [],
    qualities: staticMetadataData.qualities || []
  };
}

export function getStaticExportCollections() {
  if (staticCollectionsData.items) {
    return Object.values(staticCollectionsData.items).sort((a: any, b: any) => (b.order || 0) - (a.order || 0));
  }
  return [];
}
