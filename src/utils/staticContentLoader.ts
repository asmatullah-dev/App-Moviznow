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
export function seedStaticExportData(forceOverwrite: boolean = false): void {
  try {
    const isSeeded = safeStorage.getItem('static_data_seeded_v3');
    if (!forceOverwrite && isSeeded === 'true') {
      return; // Instantly skip redundant parsing, mapping and writing of 2,478 catalog items
    }

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

    const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
    let localMeta: Record<string, any> = {};
    try { localMeta = JSON.parse(localMetaString); } catch (e) {}

    const baseSeedVersion = '1970-01-01T00:00:00.000Z';

    // 2. Write chunk objects into local storage
    for (const [chunkId, itemsObj] of Object.entries(chunkMap)) {
      const storageKey = 'content_chunk_' + chunkId;
      const existingStr = safeStorage.getItem(storageKey);
      if (forceOverwrite || !existingStr || existingStr === '{}') {
        safeStorage.setItem(storageKey, JSON.stringify(itemsObj));
        if (!localMeta[chunkId]) {
          localMeta[chunkId] = { updatedAt: baseSeedVersion, count: Object.keys(itemsObj).length };
        }
      } else {
        try {
          const existing = JSON.parse(existingStr);
          let modified = false;
          for (const [id, staticItem] of Object.entries(itemsObj)) {
            if (!existing[id] || JSON.stringify(existing[id]) !== JSON.stringify(staticItem)) {
              existing[id] = staticItem;
              modified = true;
            }
          }
          if (modified) {
            safeStorage.setItem(storageKey, JSON.stringify(existing));
          }
          if (!localMeta[chunkId]) {
            localMeta[chunkId] = { updatedAt: baseSeedVersion, count: Object.keys(existing).length };
          }
        } catch (e) {
          safeStorage.setItem(storageKey, JSON.stringify(itemsObj));
        }
      }
    }

    // 3. Populate metadata (genres, languages, qualities) if missing
    if (staticMetadataData.genres && staticMetadataData.genres.length > 0 && !safeStorage.getItem('genres_cache')) {
      safeStorage.setItem('genres_cache', JSON.stringify(staticMetadataData.genres));
    }
    if (staticMetadataData.languages && staticMetadataData.languages.length > 0 && !safeStorage.getItem('languages_cache')) {
      safeStorage.setItem('languages_cache', JSON.stringify(staticMetadataData.languages));
    }
    if (staticMetadataData.qualities && staticMetadataData.qualities.length > 0 && !safeStorage.getItem('qualities_cache')) {
      safeStorage.setItem('qualities_cache', JSON.stringify(staticMetadataData.qualities));
    }
    if (!localMeta.metadata) localMeta.metadata = { updatedAt: baseSeedVersion };

    // 4. Populate collections if missing
    if (staticCollectionsData.items && Object.keys(staticCollectionsData.items).length > 0) {
      if (!safeStorage.getItem('local_collection_chunk_collection_chunk_0')) {
        safeStorage.setItem('local_collection_chunk_collection_chunk_0', JSON.stringify(staticCollectionsData.items));
      }
      if (!safeStorage.getItem('collections_cache')) {
        const collList = Object.values(staticCollectionsData.items).sort((a: any, b: any) => (b.order || 0) - (a.order || 0));
        safeStorage.setItem('collections_cache', JSON.stringify(collList));
      }
    }
    if (!localMeta.collections) localMeta.collections = { updatedAt: baseSeedVersion };

    safeStorage.setItem('chunk_meta_versions', JSON.stringify(localMeta));
    if (!safeStorage.getItem('last_successful_meta_check')) {
      safeStorage.setItem('last_successful_meta_check', Date.now().toString());
    }
    safeStorage.setItem('static_data_seeded_v3', 'true');
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
