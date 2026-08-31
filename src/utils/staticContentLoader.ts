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
 * Evaluates explicit version/exportedAt properties or calculates the latest
 * timestamp across metadata, collections, and content items.
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

/**
 * Checks whether the static export JSON file is newer than the version applied to local cache.
 */
export function isStaticExportNewer(): boolean {
  const currentVer = getStaticExportVersion();
  const cachedVer = safeStorage.getItem('cached_json_catalog_version');

  if (!cachedVer) return true;
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
 * Guarantees zero loading delay on app open by serving from local cache immediately.
 * If cache is completely empty (first run), it bootstraps initial items synchronously.
 */
export function getCachedContentData(includeStatic: boolean = true): {
  contentList: Content[];
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
  collections: AppCollection[];
  hasCache: boolean;
} {
  // 1. Try memory cache
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
      console.warn('Failed to parse cached content, attempting chunk recovery:', e);
    }
  }

  // 3. Try recovering from chunks in safeStorage
  const chunkKeys = safeStorage.keys().filter(k =>
    k.startsWith('content_chunk_') ||
    (includeStatic && k.startsWith('static_content_chunk_')) ||
    k.startsWith('movie_chunk_') ||
    k.startsWith('series_chunk_')
  );

  if (chunkKeys.length > 0) {
    const rawContentMap: Record<string, Content> = {};
    for (const key of chunkKeys) {
      const chunkStr = safeStorage.getItem(key);
      if (chunkStr) {
        try {
          const items = JSON.parse(chunkStr);
          Object.entries(items).forEach(([id, item]: [string, any]) => {
            const expanded = expandContent({ ...item, id }, key);
            rawContentMap[expanded.id] = expanded;
          });
        } catch (e) {}
      }
    }

    const recoveredList = Object.values(rawContentMap).sort(
      (a, b) => (b.order ?? 0) - (a.order ?? 0)
    );

    if (recoveredList.length > 0) {
      memoizedContentList = recoveredList;
      safeStorage.setItem('content_cache', JSON.stringify(recoveredList));
      return {
        contentList: recoveredList,
        genres: getCachedGenres(includeStatic),
        languages: getCachedLanguages(includeStatic),
        qualities: getCachedQualities(includeStatic),
        collections: getCachedCollections(includeStatic),
        hasCache: true
      };
    }
  }

  // 4. Cache is completely empty (brand new installation / first launch)
  // Seed synchronously so the first frame renders immediately without a loading spinner!
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

  // Persist to static chunks
  for (const [chunkId, itemsObj] of Object.entries(chunkMap)) {
    safeStorage.setItem('static_content_chunk_' + chunkId, JSON.stringify(itemsObj));
  }

  // Persist metadata
  const initialGenres = getStaticExportMetadata().genres;
  const initialLanguages = getStaticExportMetadata().languages;
  const initialQualities = getStaticExportMetadata().qualities;
  const initialCollections = getStaticExportCollections();

  safeStorage.setItem('static_genres_cache', JSON.stringify(initialGenres));
  safeStorage.setItem('static_languages_cache', JSON.stringify(initialLanguages));
  safeStorage.setItem('static_qualities_cache', JSON.stringify(initialQualities));
  safeStorage.setItem('static_collections_cache', JSON.stringify(initialCollections));
  if (staticCollectionsData.items) {
    safeStorage.setItem('static_collection_chunk_collection_chunk_0', JSON.stringify(staticCollectionsData.items));
  }

  const currentVer = getStaticExportVersion();
  safeStorage.setItem('cached_json_catalog_version', currentVer);

  // We do NOT update the primary chunk_meta_versions here to keep Admin management pure

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
 * Safely merges a newer static export JSON file into the existing local cache.
 * Rules:
 * 1. If an item exists in the JSON file and does not exist in cache: add it.
 * 2. If an item exists in both: compare timestamps.
 *    - If JSON item timestamp is newer: update cached item.
 *    - If local item timestamp is newer or equal: preserve local item (protects local edits).
 * 3. If an item exists in cache and NOT in JSON file: PRESERVE it (never deletes local items).
 * 4. Merges metadata and collections safely.
 * 5. Updates chunk storage, content_cache, and cached_json_catalog_version.
 */
export function mergeStaticExportDataSafely(): {
  contentList: Content[];
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
  collections: AppCollection[];
  stats: { added: number; updated: number; preserved: number };
} {
  const existingData = getCachedContentData();
  const existingMap = new Map<string, Content>();
  existingData.contentList.forEach(item => existingMap.set(item.id, item));

  const jsonItems = staticContentData as StaticContentItem[];
  let added = 0;
  let updated = 0;
  let preserved = 0;

  for (const jsonItem of jsonItems) {
    const chunkId = jsonItem.chunkId || (jsonItem.type === 'movie' ? 'movie_chunk_0' : 'series_chunk_0');
    const expandedJson = expandContent({ ...jsonItem, id: jsonItem.id }, chunkId);

    if (!existingMap.has(jsonItem.id)) {
      // New item from JSON
      existingMap.set(jsonItem.id, expandedJson);
      added++;
    } else {
      const existingItem = existingMap.get(jsonItem.id)!;
      const cachedTime = parseVersionTime(
        existingItem.updatedAt || existingItem.createdAt || (existingItem as any).upd || (existingItem as any).cre || 0
      );
      const jsonTime = parseVersionTime(
        jsonItem.upd || jsonItem.cre || expandedJson.updatedAt || expandedJson.createdAt || 0
      );

      if (jsonTime > cachedTime) {
        // JSON file has newer changes for this item
        existingMap.set(jsonItem.id, { ...existingItem, ...expandedJson });
        updated++;
      } else {
        // Local cache has newer or same version; protect local changes
        existingMap.set(jsonItem.id, { ...expandedJson, ...existingItem });
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

  // 2. Safe merge of genres
  const cachedGenres = getCachedGenres();
  const genreMap = new Map<string, Genre>();
  cachedGenres.forEach(g => genreMap.set(g.id, g));
  const staticGenres = getStaticExportMetadata().genres;
  staticGenres.forEach(sg => {
    if (!genreMap.has(sg.id)) {
      genreMap.set(sg.id, sg);
    } else {
      genreMap.set(sg.id, { ...genreMap.get(sg.id)!, ...sg });
    }
  });
  const mergedGenres = Array.from(genreMap.values());

  // 3. Safe merge of languages
  const cachedLanguages = getCachedLanguages();
  const languageMap = new Map<string, Language>();
  cachedLanguages.forEach(l => languageMap.set(l.id, l));
  const staticLanguages = getStaticExportMetadata().languages;
  staticLanguages.forEach(sl => {
    if (!languageMap.has(sl.id)) {
      languageMap.set(sl.id, sl);
    } else {
      languageMap.set(sl.id, { ...languageMap.get(sl.id)!, ...sl });
    }
  });
  const mergedLanguages = Array.from(languageMap.values());

  // 4. Safe merge of qualities
  const cachedQualities = getCachedQualities();
  const qualityMap = new Map<string, Quality>();
  cachedQualities.forEach(q => qualityMap.set(q.id, q));
  const staticQualities = getStaticExportMetadata().qualities;
  staticQualities.forEach(sq => {
    if (!qualityMap.has(sq.id)) {
      qualityMap.set(sq.id, sq);
    } else {
      qualityMap.set(sq.id, { ...qualityMap.get(sq.id)!, ...sq });
    }
  });
  const mergedQualities = Array.from(qualityMap.values());

  // 5. Safe merge of collections
  const cachedCollections = getCachedCollections();
  const collectionMap = new Map<string, AppCollection>();
  cachedCollections.forEach(c => collectionMap.set(c.id, c));
  const staticCollections = getStaticExportCollections();
  staticCollections.forEach(sc => {
    if (!collectionMap.has(sc.id)) {
      collectionMap.set(sc.id, sc);
    } else {
      const existing = collectionMap.get(sc.id)!;
      const existingTime = parseVersionTime(existing.updatedAt || 0);
      const staticTime = parseVersionTime(sc.updatedAt || 0);
      if (staticTime >= existingTime) {
        collectionMap.set(sc.id, { ...existing, ...sc });
      }
    }
  });
  const mergedCollections = Array.from(collectionMap.values()).sort(
    (a, b) => (b.order ?? 0) - (a.order ?? 0)
  );

  // 6. Write chunk objects into static storage
  const chunkMap: Record<string, Record<string, any>> = {};
  for (const item of jsonItems) {
    const chunkId = item.chunkId || (item.type === 'movie' ? 'movie_chunk_0' : 'series_chunk_0');
    if (!chunkMap[chunkId]) chunkMap[chunkId] = {};
    chunkMap[chunkId][item.id] = item;
  }
  for (const [chunkId, itemsObj] of Object.entries(chunkMap)) {
    const storageKey = 'static_content_chunk_' + chunkId;
    const existingStr = safeStorage.getItem(storageKey);
    if (!existingStr || existingStr === '{}') {
      safeStorage.setItem(storageKey, JSON.stringify(itemsObj));
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
      } catch (e) {
        safeStorage.setItem(storageKey, JSON.stringify(itemsObj));
      }
    }
  }

  // 7. Persist static markers only - do NOT pollute main content_cache
  safeStorage.setItem('static_genres_cache', JSON.stringify(mergedGenres));
  safeStorage.setItem('static_languages_cache', JSON.stringify(mergedLanguages));
  safeStorage.setItem('static_qualities_cache', JSON.stringify(mergedQualities));
  safeStorage.setItem('static_collections_cache', JSON.stringify(mergedCollections));

  // 8. Update version markers
  const currentVer = getStaticExportVersion();
  safeStorage.setItem('cached_json_catalog_version', currentVer);
  safeStorage.setItem('last_successful_meta_check', Date.now().toString());

  // Update memory cache
  memoizedContentList = mergedList;

  // Dispatch event so any other active views/tabs immediately update
  try {
    window.dispatchEvent(new CustomEvent('static_content_updated'));
  } catch (e) {}

  return {
    contentList: mergedList,
    genres: mergedGenres,
    languages: mergedLanguages,
    qualities: mergedQualities,
    collections: mergedCollections,
    stats: { added, updated, preserved }
  };
}

/**
 * Legacy compatibility wrapper: seeds static data only when forced or when
 * the cache is not populated, and safely merges if newer.
 */
export function seedStaticExportData(forceOverwrite: boolean = false): void {
  try {
    // If not forcing overwrite and static export is not newer, skip if cache exists
    if (!forceOverwrite && !isStaticExportNewer()) {
      const hasCache = !!safeStorage.getItem('content_cache') || !!safeStorage.getItem('chunk_meta_versions');
      if (hasCache) {
        return;
      }
    }

    if (isStaticExportNewer() && !forceOverwrite) {
      mergeStaticExportDataSafely();
      return;
    }

    // Force overwrite: write full export data
    const chunkMap: Record<string, Record<string, any>> = {};
    const items = staticContentData as StaticContentItem[];

    for (const item of items) {
      const cId = item.chunkId || (item.type === 'movie' ? 'movie_chunk_0' : 'series_chunk_0');
      if (!chunkMap[cId]) chunkMap[cId] = {};
      chunkMap[cId][item.id] = item;
    }

    const currentVer = getStaticExportVersion();
    const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
    let localMeta: Record<string, any> = {};
    try { localMeta = JSON.parse(localMetaString); } catch (e) {}

    for (const [chunkId, itemsObj] of Object.entries(chunkMap)) {
      const storageKey = 'static_content_chunk_' + chunkId;
      safeStorage.setItem(storageKey, JSON.stringify(itemsObj));
      localMeta[chunkId] = { updatedAt: currentVer, count: Object.keys(itemsObj).length };
    }

    const itemMap: Record<string, Content> = {};
    for (const item of items) {
      const chunkId = item.chunkId || (item.type === 'movie' ? 'movie_chunk_0' : 'series_chunk_0');
      itemMap[item.id] = expandContent({ ...item, id: item.id }, chunkId);
    }
    const sortedList = Object.values(itemMap).sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
    memoizedContentList = sortedList;
    
    // Do NOT write to content_cache directly to keep it pure for Admin management

    if (staticMetadataData.genres) safeStorage.setItem('static_genres_cache', JSON.stringify(staticMetadataData.genres));
    if (staticMetadataData.languages) safeStorage.setItem('static_languages_cache', JSON.stringify(staticMetadataData.languages));
    if (staticMetadataData.qualities) safeStorage.setItem('static_qualities_cache', JSON.stringify(staticMetadataData.qualities));
    if (staticCollectionsData.items) {
      safeStorage.setItem('static_collection_chunk_collection_chunk_0', JSON.stringify(staticCollectionsData.items));
      const collList = Object.values(staticCollectionsData.items).sort((a: any, b: any) => (b.order || 0) - (a.order || 0));
      safeStorage.setItem('static_collections_cache', JSON.stringify(collList));
    }

    // Do NOT update chunk_meta_versions here either to keep it pure

    safeStorage.setItem('cached_json_catalog_version', currentVer);
    safeStorage.setItem('last_successful_meta_check', Date.now().toString());

    try {
      window.dispatchEvent(new CustomEvent('static_content_updated'));
    } catch (e) {}
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
    return (Object.values(staticCollectionsData.items) as AppCollection[]).sort((a: any, b: any) => (b.order || 0) - (a.order || 0));
  }
  return [];
}
