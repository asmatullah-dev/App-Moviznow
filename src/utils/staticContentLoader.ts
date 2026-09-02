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
 */
export function getStaticExportVersion(): string {
  if (memoizedJsonVersion) return memoizedJsonVersion;

  const explicit = (unifiedData as any).exportedAt || (unifiedData as any).version;
  if (explicit) {
    memoizedJsonVersion = String(explicit);
    return memoizedJsonVersion;
  }

  let maxTime = 0;
  let maxTimeStr = '';

  const metaUpd = staticMetadataData?.updatedAt;
  if (metaUpd) {
    const t = parseVersionTime(metaUpd);
    if (t > maxTime) {
      maxTime = t;
      maxTimeStr = new Date(t).toISOString();
    }
  }

  const collUpd = staticCollectionsData?.updatedAt;
  if (collUpd) {
    const t = parseVersionTime(collUpd);
    if (t > maxTime) {
      maxTime = t;
      maxTimeStr = new Date(t).toISOString();
    }
  }

  const items = staticContentData as StaticContentItem[];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemUpd = item.upd || item.cre || (item as any).updatedAt || (item as any).createdAt;
    if (itemUpd) {
      const t = parseVersionTime(itemUpd);
      if (t > maxTime) {
        maxTime = t;
        maxTimeStr = typeof itemUpd === 'string' ? itemUpd : new Date(t).toISOString();
      }
    }
  }

  const versionStr = maxTimeStr ? `${maxTimeStr}_count_${items.length}` : `static_count_${items.length}`;
  memoizedJsonVersion = versionStr;
  return memoizedJsonVersion;
}

let isMergingStatic = false;

/**
 * Checks whether the static export JSON file is newer than the version applied to local cache.
 */
export function isStaticExportNewer(): boolean {
  if (isMergingStatic) return false;
  const currentVer = getStaticExportVersion();
  const cachedVer = safeStorage.getItem('cached_json_catalog_version');

  if (!cachedVer) return false; // Handled directly on init synchronously
  if (cachedVer === currentVer) return false;

  const currTime = parseVersionTime(currentVer);
  const cachedTime = parseVersionTime(cachedVer);

  if (currTime > 0 && cachedTime > 0) {
    if (currTime > cachedTime) return true;
    if (cachedTime > currTime) return false;
  }

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

function getCachedCollections(includeStatic: boolean = true): AppCollection[] {
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
    return getStaticExportCollections();
  }
  return [];
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

        if (jsonTime > existingTime) {
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
        safeStorage.setItem('static_collections_cache', JSON.stringify(mergedCollections));

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
