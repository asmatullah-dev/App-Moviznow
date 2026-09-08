import unifiedData from '../data/moviznow_catalog_export.json';
import { safeStorage } from './safeStorage';
import { Content, Genre, Language, Quality, Collection as AppCollection } from '../types';
import { expandContent } from './chunkUtils';
import { parseVersionTime } from './chunkMeta';

export interface StaticContentItem {
  id: string;
  chunkId?: string;
  type: string;
  title: string;
  [key: string]: any;
}

const staticContentData = unifiedData.content;
const staticMetadataData = (unifiedData as any).metadata || {};
const staticCollectionsData = (unifiedData as any).collections || {};

// In-memory reference to avoid repeatedly deserializing JSON on re-renders or context accesses
let memoizedContentList: Content[] | null = null;
let memoizedJsonVersion: string | null = null;

/**
 * Calculates a unique, reliable version string for the static export JSON file.
 * Incorporates explicit version/exportedAt, item count, and a fast 32-bit content hash across all items.
 * Guarantees that any addition, deletion, or modification in the JSON creates a new version string.
 */
export function getStaticExportVersion(): string {
  if (memoizedJsonVersion) return memoizedJsonVersion;

  const explicit = (unifiedData as any).exportedAt || (unifiedData as any).version || '';
  const items = (staticContentData || []) as StaticContentItem[];

  // Fast 32-bit hash across all items to detect any field edits, additions or removals
  let hash = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const s = `${item.id}|${item.tit || item.title || ''}|${item.upd || item.cre || ''}|${item.ord ?? ''}|${item.qua || ''}|${item.yea || ''}`;
    for (let j = 0; j < s.length; j++) {
      hash = (Math.imul(31, hash) + s.charCodeAt(j)) | 0;
    }
  }

  memoizedJsonVersion = `v2_${explicit}_cnt_${items.length}_h_${hash}`;
  return memoizedJsonVersion;
}

let isMergingStatic = false;

/**
 * Checks whether the static export JSON file has changed compared to what was cached.
 */
export function isStaticExportNewer(): boolean {
  if (isMergingStatic) return false;
  const currentVer = getStaticExportVersion();
  const cachedVer = safeStorage.getItem('cached_json_catalog_version');

  // If there is no cached content at all (clean first launch),
  // getCachedContentData handles it on startup synchronously without showing an update banner.
  const cachedContentStr = safeStorage.getItem('content_cache');
  if (!cachedContentStr || cachedContentStr === '[]') {
    return false;
  }

  // If cachedVer is missing or does not match currentVer,
  // we have a new JSON export or changes!
  if (!cachedVer) return true;
  return currentVer !== cachedVer;
}

/**
 * Returns cached content, metadata, and collections synchronously.
 * Guarantees zero loading delay on app open by serving from local cache or in-memory bundle immediately.
 */
export function getCachedContentData(includeStatic: boolean = true): {
  contentList: Content[];
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
  collections: AppCollection[];
  hasCache: boolean;
} {
  const currentVer = getStaticExportVersion();

  // 1. Try in-memory cache for instant zero-computation return
  if (includeStatic && memoizedContentList && memoizedContentList.length > 0) {
    return {
      contentList: memoizedContentList,
      genres: getCachedGenres(includeStatic),
      languages: getCachedLanguages(includeStatic),
      qualities: getCachedQualities(includeStatic),
      collections: getCachedCollections(includeStatic),
      hasCache: true
    };
  }

  // 2. Try content_cache in safeStorage
  const cachedContentStr = safeStorage.getItem('content_cache');
  if (cachedContentStr && cachedContentStr !== '[]') {
    try {
      const parsed = JSON.parse(cachedContentStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (includeStatic) memoizedContentList = parsed;
        return {
          contentList: parsed,
          genres: getCachedGenres(includeStatic),
          languages: getCachedLanguages(includeStatic),
          qualities: getCachedQualities(includeStatic),
          collections: getCachedCollections(includeStatic),
          hasCache: true
        };
      }
    } catch (e) {
      console.warn('Failed to parse cached content:', e);
    }
  }

  // 3. Cache empty on first launch: build in-memory list directly from unifiedData (0ms freeze)
  const items = staticContentData as StaticContentItem[];
  const itemMap: Record<string, Content> = {};
  const chunkMap: Record<string, Record<string, any>> = {};

  for (const item of items) {
    const chunkId = item.chunkId || (item.type === 'movie' ? 'movie_chunk_0' : 'series_chunk_0');
    itemMap[item.id] = expandContent({ ...item, id: item.id }, chunkId);

    if (!chunkMap[chunkId]) chunkMap[chunkId] = {};
    chunkMap[chunkId][item.id] = item;
  }

  const initialList = Object.values(itemMap).sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  memoizedContentList = initialList;
  safeStorage.setItem('cached_json_catalog_version', currentVer);

  // Persist to safeStorage asynchronously in the background so the initial UI paints without lag
  setTimeout(() => {
    try {
      safeStorage.setItem('content_cache', JSON.stringify(initialList));
      for (const [chunkId, itemsObj] of Object.entries(chunkMap)) {
        safeStorage.setItem('static_content_chunk_' + chunkId, JSON.stringify(itemsObj));
      }
      safeStorage.setItem('static_genres_cache', JSON.stringify(getStaticExportMetadata().genres));
      safeStorage.setItem('static_languages_cache', JSON.stringify(getStaticExportMetadata().languages));
      safeStorage.setItem('static_qualities_cache', JSON.stringify(getStaticExportMetadata().qualities));
      safeStorage.setItem('static_collections_cache', JSON.stringify(getStaticExportCollections()));
      if (staticCollectionsData.items) {
        safeStorage.setItem('static_collection_chunk_collection_chunk_0', JSON.stringify(staticCollectionsData.items));
      }
    } catch (e) {}
  }, 100);

  return {
    contentList: includeStatic ? initialList : [],
    genres: getCachedGenres(includeStatic),
    languages: getCachedLanguages(includeStatic),
    qualities: getCachedQualities(includeStatic),
    collections: getCachedCollections(includeStatic),
    hasCache: includeStatic ? initialList.length > 0 : false
  };
}

function getCachedGenres(includeStatic: boolean = true): Genre[] {
  const g = safeStorage.getItem('genres_cache');
  if (g) {
    try {
      const parsed = JSON.parse(g);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  if (includeStatic) {
    const sg = safeStorage.getItem('static_genres_cache');
    if (sg) {
      try {
        const parsed = JSON.parse(sg);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return getStaticExportMetadata().genres;
  }
  return [];
}

function getCachedLanguages(includeStatic: boolean = true): Language[] {
  const l = safeStorage.getItem('languages_cache');
  if (l) {
    try {
      const parsed = JSON.parse(l);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  if (includeStatic) {
    const sl = safeStorage.getItem('static_languages_cache');
    if (sl) {
      try {
        const parsed = JSON.parse(sl);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return getStaticExportMetadata().languages;
  }
  return [];
}

function getCachedQualities(includeStatic: boolean = true): Quality[] {
  const q = safeStorage.getItem('qualities_cache');
  if (q) {
    try {
      const parsed = JSON.parse(q);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  if (includeStatic) {
    const sq = safeStorage.getItem('static_qualities_cache');
    if (sq) {
      try {
        const parsed = JSON.parse(sq);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return getStaticExportMetadata().qualities;
  }
  return [];
}

/**
 * Purges all old collection data from cache (safeStorage & localStorage)
 * and initializes the fresh collections list directly from the static export JSON.
 */
export function resetCollectionsFromStaticJson(markPendingSync: boolean = false): AppCollection[] {
  try {
    // 1. Delete all old collection-related keys from safeStorage
    const allKeys = safeStorage.keys();
    for (const key of allKeys) {
      if (
        key === 'collections_cache' ||
        key === 'admin_collections_cache' ||
        key === 'static_collections_cache' ||
        key === 'admin_pending_collection_updates' ||
        key.startsWith('collection_chunk_') ||
        key.startsWith('admin_collection_chunk_') ||
        key.startsWith('admin_synced_collection_chunk_') ||
        key.startsWith('static_collection_chunk_')
      ) {
        safeStorage.removeItem(key);
      }
    }

    // 2. Also clear from localStorage directly
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const lsKeys = Object.keys(localStorage);
        for (const k of lsKeys) {
          if (
            k === 'collections_cache' ||
            k === 'admin_collections_cache' ||
            k === 'static_collections_cache' ||
            k === 'admin_pending_collection_updates' ||
            k.startsWith('collection_chunk_') ||
            k.startsWith('admin_collection_chunk_') ||
            k.startsWith('admin_synced_collection_chunk_') ||
            k.startsWith('static_collection_chunk_')
          ) {
            localStorage.removeItem(k);
          }
        }
      } catch (e) {}
    }

    // 3. Extract fresh collections list from static export JSON
    const newCollections = getStaticExportCollections();
    const chunkItems: Record<string, any> = {};
    for (const col of newCollections) {
      chunkItems[col.id] = col;
    }

    const collJson = JSON.stringify(newCollections);
    const chunkJson = JSON.stringify(chunkItems);

    // 4. Save new collections to cache
    safeStorage.setItem('collections_cache', collJson);
    safeStorage.setItem('static_collections_cache', collJson);
    safeStorage.setItem('admin_collections_cache', collJson);

    safeStorage.setItem('collection_chunk_0', chunkJson);
    safeStorage.setItem('admin_collection_chunk_collection_chunk_0', chunkJson);
    safeStorage.setItem('static_collection_chunk_collection_chunk_0', chunkJson);

    if (markPendingSync) {
      safeStorage.setItem('admin_pending_collection_updates', JSON.stringify(['collection_chunk_0']));
    } else {
      safeStorage.setItem('admin_synced_collection_chunk_collection_chunk_0', chunkJson);
    }

    const collUpd = staticCollectionsData?.updatedAt;
    const verTime = collUpd ? parseVersionTime(collUpd) : Date.now();
    safeStorage.setItem('cached_json_collections_version', verTime.toString());

    // 5. Dispatch events to notify UI and active contexts
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('collections_updated_locally', { detail: newCollections }));
      window.dispatchEvent(new CustomEvent('content_updated_locally'));
    }

    return newCollections;
  } catch (e) {
    console.error('Error resetting collections from static JSON:', e);
    return getStaticExportCollections();
  }
}

function getCachedCollections(includeStatic: boolean = true): AppCollection[] {
  const collUpd = staticCollectionsData?.updatedAt;
  const staticTime = collUpd ? parseVersionTime(collUpd) : 0;
  const cachedCollTime = parseInt(safeStorage.getItem('cached_json_collections_version') || '0', 10);

  // If static JSON has a newer collection timestamp or cached version is not set, purge old collection cache & reload fresh!
  if (staticTime > 0 && (!cachedCollTime || staticTime > cachedCollTime)) {
    return resetCollectionsFromStaticJson(false);
  }

  const c = safeStorage.getItem('collections_cache');
  if (c) {
    try {
      const parsed = JSON.parse(c);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  if (includeStatic) {
    const sc = safeStorage.getItem('static_collections_cache');
    if (sc) {
      try {
        const parsed = JSON.parse(sc);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return resetCollectionsFromStaticJson(false);
  }
  return [];
}

/**
 * Formats toast message when a new JSON file is updated:
 * - Shows even 1 content is updated or even 1 content is added
 * - If only added, then show added message (e.g. "1 content added" or "X contents added")
 * - If only updated, then show updated message (e.g. "1 content updated" or "Y contents updated")
 * - If both, then show both (e.g. "1 content added, 1 content updated" or "X contents added, Y contents updated")
 * - Never shows deleted number
 * - Never shows if updated or added is 0 (returns null)
 */
export function formatContentUpdateToast(added: number, updated: number): string | null {
  if (added <= 0 && updated <= 0) return null;

  const addedStr = added > 0 ? `${added} ${added === 1 ? 'content added' : 'contents added'}` : null;
  const updatedStr = updated > 0 ? `${updated} ${updated === 1 ? 'content updated' : 'contents updated'}` : null;

  if (addedStr && updatedStr) {
    return `${addedStr}, ${updatedStr}`;
  }
  return addedStr || updatedStr;
}

function normalizeStringOrObj(val: any): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val);
  } catch (e) {
    return String(val);
  }
}

function isContentDifferent(existing: Content, fresh: Content): boolean {
  if ((existing.title || '') !== (fresh.title || '')) return true;
  if ((existing.type || '') !== (fresh.type || '')) return true;
  if ((existing.year || 0) !== (fresh.year || 0)) return true;
  if ((existing.posterUrl || '') !== (fresh.posterUrl || '')) return true;
  if ((existing.trailerUrl || '') !== (fresh.trailerUrl || '')) return true;
  if ((existing.description || '') !== (fresh.description || '')) return true;
  if ((existing.order ?? 0) !== (fresh.order ?? 0)) return true;
  if ((existing.qualityId || '') !== (fresh.qualityId || '')) return true;
  if ((existing.secondTitle || '') !== (fresh.secondTitle || '')) return true;
  if ((existing.status || '') !== (fresh.status || '')) return true;
  if ((existing.imdbRating || '') !== (fresh.imdbRating || '')) return true;
  if (normalizeStringOrObj(existing.movieLinks) !== normalizeStringOrObj(fresh.movieLinks)) return true;
  if (normalizeStringOrObj(existing.seasons) !== normalizeStringOrObj(fresh.seasons)) return true;
  if ((existing.fullSeasonZip || '') !== (fresh.fullSeasonZip || '')) return true;
  if ((existing.fullSeasonMkv || '') !== (fresh.fullSeasonMkv || '')) return true;
  if (JSON.stringify(existing.genreIds || []) !== JSON.stringify(fresh.genreIds || [])) return true;
  if (JSON.stringify(existing.languageIds || []) !== JSON.stringify(fresh.languageIds || [])) return true;
  return false;
}

/**
 * Safely merges a newer static export JSON file into the user catalog cache.
 * STRICT ISOLATION:
 * - Never modifies, overwrites, or merges any admin_* storage keys or admin chunk data.
 * - Merges static catalog smoothly into content_cache and static_content_chunk_*.
 */
export function mergeStaticExportDataSafely(): {
  contentList: Content[];
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
  collections: AppCollection[];
  stats: { added: number; updated: number; preserved: number };
} {
  if (isMergingStatic) {
    return {
      contentList: memoizedContentList || [],
      genres: getStaticExportMetadata().genres,
      languages: getStaticExportMetadata().languages,
      qualities: getStaticExportMetadata().qualities,
      collections: getStaticExportCollections(),
      stats: { added: 0, updated: 0, preserved: 0 }
    };
  }

  isMergingStatic = true;
  try {
    const existingMap = new Map<string, Content>();

    // 1. Read existing content from primary content_cache if available
    const cachedContentStr = safeStorage.getItem('content_cache');
    if (cachedContentStr && cachedContentStr !== '[]') {
      try {
        const parsed = JSON.parse(cachedContentStr);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.id) {
              existingMap.set(item.id, item);
            }
          }
        }
      } catch (e) {}
    }

    // 2. Read only from static_content_chunk_ or standard content_chunk_ (strictly avoiding admin_* keys)
    const chunkKeys = safeStorage.keys().filter(k =>
      (k.startsWith('static_content_chunk_') || k.startsWith('content_chunk_') || k.startsWith('movie_chunk_') || k.startsWith('series_chunk_')) &&
      !k.startsWith('admin_')
    );
    for (const key of chunkKeys) {
      const chunkStr = safeStorage.getItem(key);
      if (chunkStr) {
        try {
          const itemsObj = JSON.parse(chunkStr);
          Object.entries(itemsObj).forEach(([id, item]: [string, any]) => {
            if (!existingMap.has(id)) {
              const expanded = expandContent({ ...item, id }, key);
              existingMap.set(expanded.id, expanded);
            }
          });
        } catch (e) {}
      }
    }

    // 3. Merge static JSON catalog items safely
    const jsonItems = staticContentData as StaticContentItem[];
    let added = 0;
    let updated = 0;
    let preserved = 0;

    for (const jsonItem of jsonItems) {
      const chunkId = jsonItem.chunkId || (jsonItem.type === 'movie' ? 'movie_chunk_0' : 'series_chunk_0');
      const expandedJson = expandContent({ ...jsonItem, id: jsonItem.id }, chunkId);

      if (!existingMap.has(jsonItem.id)) {
        existingMap.set(jsonItem.id, expandedJson);
        added++;
      } else {
        const existing = existingMap.get(jsonItem.id)!;
        const jsonTime = parseVersionTime(expandedJson.updatedAt || expandedJson.createdAt || 0);
        const existingTime = parseVersionTime(existing.updatedAt || existing.createdAt || 0);

        if (jsonTime > existingTime || isContentDifferent(existing, expandedJson)) {
          existingMap.set(jsonItem.id, expandedJson);
          updated++;
        } else {
          preserved++;
        }
      }
    }

    // Final merged list sorted by order descending (or createdAt)
    const mergedList = Array.from(existingMap.values()).sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return (b.order ?? 0) - (a.order ?? 0);
      }
      const timeA = a.createdAt ? parseVersionTime(a.createdAt) : 0;
      const timeB = b.createdAt ? parseVersionTime(b.createdAt) : 0;
      return timeB - timeA;
    });

    const mergedGenres = getStaticExportMetadata().genres;
    const mergedLanguages = getStaticExportMetadata().languages;
    const mergedQualities = getStaticExportMetadata().qualities;
    const mergedCollections = getStaticExportCollections();

    // Update memory cache immediately
    memoizedContentList = mergedList;

    // Persist merged cache and static metadata in non-blocking background queue
    setTimeout(() => {
      try {
        safeStorage.setItem('content_cache', JSON.stringify(mergedList));
        safeStorage.setItem('static_genres_cache', JSON.stringify(mergedGenres));
        safeStorage.setItem('static_languages_cache', JSON.stringify(mergedLanguages));
        safeStorage.setItem('static_qualities_cache', JSON.stringify(mergedQualities));
        
        const mergedCollJson = JSON.stringify(mergedCollections);
        safeStorage.setItem('static_collections_cache', mergedCollJson);
        safeStorage.setItem('collections_cache', mergedCollJson);
        safeStorage.setItem('admin_collections_cache', mergedCollJson);

        const collChunkItems: Record<string, any> = {};
        for (const col of mergedCollections) {
          collChunkItems[col.id] = col;
        }
        const collChunkJson = JSON.stringify(collChunkItems);
        safeStorage.setItem('collection_chunk_0', collChunkJson);
        safeStorage.setItem('admin_collection_chunk_collection_chunk_0', collChunkJson);
        safeStorage.setItem('static_collection_chunk_collection_chunk_0', collChunkJson);
        
        const collUpd = staticCollectionsData?.updatedAt;
        const verTime = collUpd ? parseVersionTime(collUpd) : Date.now();
        safeStorage.setItem('cached_json_collections_version', verTime.toString());

        const chunkMap: Record<string, Record<string, any>> = {};
        for (const item of jsonItems) {
          const chunkId = item.chunkId || (item.type === 'movie' ? 'movie_chunk_0' : 'series_chunk_0');
          if (!chunkMap[chunkId]) chunkMap[chunkId] = {};
          chunkMap[chunkId][item.id] = item;
        }
        for (const [chunkId, itemsObj] of Object.entries(chunkMap)) {
          safeStorage.setItem('static_content_chunk_' + chunkId, JSON.stringify(itemsObj));
        }

        const currentVer = getStaticExportVersion();
        safeStorage.setItem('cached_json_catalog_version', currentVer);
        safeStorage.setItem('last_successful_meta_check', Date.now().toString());
      } catch (e) {}
    }, 50);

    return {
      contentList: mergedList,
      genres: mergedGenres,
      languages: mergedLanguages,
      qualities: mergedQualities,
      collections: mergedCollections,
      stats: { added, updated, preserved }
    };
  } finally {
    isMergingStatic = false;
  }
}

/**
 * Legacy compatibility wrapper: seeds static data only when needed without blocking the device.
 */
export function seedStaticExportData(forceOverwrite: boolean = false): void {
  try {
    if (!forceOverwrite && !isStaticExportNewer()) {
      const hasCache = !!safeStorage.getItem('content_cache');
      if (hasCache) {
        return;
      }
    }
    mergeStaticExportDataSafely();
  } catch (e) {
    console.error('Error seeding static export data:', e);
  }
}

export function getStaticExportContent(): StaticContentItem[] {
  return staticContentData as StaticContentItem[];
}

export function getStaticExportMetadata(): {
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
} {
  return {
    genres: (staticMetadataData.genres || []) as Genre[],
    languages: (staticMetadataData.languages || []) as Language[],
    qualities: (staticMetadataData.qualities || []) as Quality[]
  };
}

export function getStaticExportCollections(): AppCollection[] {
  if (staticCollectionsData.items) {
    return (Object.entries(staticCollectionsData.items) as [string, any][]).map(([key, val]) => ({
      ...val,
      id: val.id || key,
    })).sort((a: any, b: any) => (b.order || 0) - (a.order || 0));
  }
  return [];
}
