import { safeStorage } from '../utils/safeStorage';

/**
 * Cache Management & Lifecycle Service
 * 
 * Rules:
 * 1. Content Chunks: NEVER DELETED. Always preserved in local storage and IndexedDB.
 *    - content_cache, chunk_meta_versions, cached_chunk_meta_doc, content_chunk_*,
 *    - collections_cache, collection_chunk_*, genres_cache, languages_cache, qualities_cache
 * 2. Content Metadata & Posters: Expired & deleted if NOT used for 3 days (3 * 24 * 60 * 60 * 1000 ms).
 *    - movie_details_*, content_cache_*, poster_cache_*, tmdb_images_*, thumbnail_*, etc.
 * 3. IMDb Ratings & OTT Platforms: Kept for 5 days if NOT used (5 * 24 * 60 * 60 * 1000 ms).
 *    - imdb_rating_v2_*, imdb_rating_*, ai_ott_*, tmdb_ott_*, tmdb_coming_soon_ott_*, etc.
 */

export const CONTENT_METADATA_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
export const IMDB_OTT_TTL_MS = 5 * 24 * 60 * 60 * 1000;         // 5 days

const ACCESS_TIMESTAMP_PREFIX = 'cache_access_ts_';
const PROTECTED_KEYS_PREFIXES = [
  'content_cache',
  'cached_json_catalog_version',
  'chunk_meta_versions',
  'cached_chunk_meta_doc',
  'content_chunk_',
  'collections_cache',
  'collection_chunk_',
  'genres_cache',
  'languages_cache',
  'qualities_cache',
  'profile_cache',
  'cached_notifications_',
  'theme',
  'app_language',
  'pending_',
  'needs_user_sync',
  'fcm_token_',
  'daily_sync_date_'
];

/**
 * Check if a storage key belongs to protected content chunks or core app state
 */
export function isProtectedChunkKey(key: string): boolean {
  if (!key) return false;
  return PROTECTED_KEYS_PREFIXES.some(prefix => key === prefix || key.startsWith(prefix));
}

/**
 * Record usage / touch timestamp for content metadata or posters
 */
export function touchMetadataUsage(contentId: string): void {
  if (!contentId || typeof window === 'undefined') return;
  try {
    const key = `${ACCESS_TIMESTAMP_PREFIX}meta_${contentId}`;
    localStorage.setItem(key, Date.now().toString());
  } catch (e) {}
}

/**
 * Record usage / touch timestamp for IMDb rating or OTT platform data
 */
export function touchImdbOttUsage(idOrKey: string): void {
  if (!idOrKey || typeof window === 'undefined') return;
  try {
    const key = `${ACCESS_TIMESTAMP_PREFIX}ott_${idOrKey}`;
    localStorage.setItem(key, Date.now().toString());
  } catch (e) {}
}

/**
 * Get last access timestamp for a key
 */
export function getLastAccessTimestamp(category: 'meta' | 'ott', idOrKey: string): number {
  if (typeof window === 'undefined') return Date.now();
  try {
    const raw = localStorage.getItem(`${ACCESS_TIMESTAMP_PREFIX}${category}_${idOrKey}`);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch (e) {}
  return 0;
}

/**
 * Main Cache Cleanup Routine:
 * - Scans localStorage, sessionStorage, and IndexedDB
 * - Preserves all content chunks indefinitely
 * - Deletes content metadata, posters, and thumbnails unused for 3 days
 * - Deletes IMDb rating and OTT platform data unused for 5 days
 */
export async function runPeriodicCacheCleanup(): Promise<{
  cleanedMetadata: number;
  cleanedRatingsOtt: number;
  cleanedThumbnails: number;
}> {
  if (typeof window === 'undefined') {
    return { cleanedMetadata: 0, cleanedRatingsOtt: 0, cleanedThumbnails: 0 };
  }

  const now = Date.now();
  let cleanedMetadata = 0;
  let cleanedRatingsOtt = 0;
  let cleanedThumbnails = 0;

  // 1. Process localStorage
  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Rule 1: Always keep content chunk data and protected keys
      if (isProtectedChunkKey(key)) {
        continue;
      }

      // Rule 2: Content metadata & posters (3-day TTL if unused)
      if (key.startsWith('movie_details_') || key.startsWith('content_cache_') || key.startsWith('poster_cache_') || key.startsWith('tmdb_images_')) {
        const id = key.replace(/^(movie_details_|content_cache_|poster_cache_|tmdb_images_)/, '');
        let lastUsed = getLastAccessTimestamp('meta', id);

        if (!lastUsed) {
          // Check embedded timestamp if present
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed.timestamp === 'number') {
                lastUsed = parsed.timestamp;
              } else if (parsed && typeof parsed.lastUsed === 'number') {
                lastUsed = parsed.lastUsed;
              }
            }
          } catch (e) {}
        }

        // If no timestamp or older than 3 days, evict
        if (lastUsed && (now - lastUsed >= CONTENT_METADATA_TTL_MS)) {
          keysToRemove.push(key);
          keysToRemove.push(`${ACCESS_TIMESTAMP_PREFIX}meta_${id}`);
          cleanedMetadata++;
        }
        continue;
      }

      // Rule 3: IMDb Ratings & OTT Platforms (5-day TTL if unused)
      if (key.startsWith('imdb_rating_v2_') || key.startsWith('imdb_rating_') || key.startsWith('ai_ott_') || key.startsWith('tmdb_ott_') || key.startsWith('tmdb_coming_soon_ott_')) {
        const idOrTitle = key.replace(/^(imdb_rating_v2_|imdb_rating_|ai_ott_|tmdb_ott_|tmdb_coming_soon_ott_)/, '');
        let lastUsed = getLastAccessTimestamp('ott', idOrTitle);

        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.timestamp === 'number') {
              lastUsed = Math.max(lastUsed, parsed.timestamp);
            }
          }
        } catch (e) {}

        // If older than 5 days, evict
        if (!lastUsed || (now - lastUsed >= IMDB_OTT_TTL_MS)) {
          keysToRemove.push(key);
          keysToRemove.push(`${ACCESS_TIMESTAMP_PREFIX}ott_${idOrTitle}`);
          cleanedRatingsOtt++;
        }
        continue;
      }

      // Cleanup expired translation caches (older than 7 days)
      if (key.startsWith('v2_trans_')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.timestamp && (now - parsed.timestamp >= 7 * 24 * 60 * 60 * 1000)) {
              keysToRemove.push(key);
            }
          }
        } catch (e) {}
        continue;
      }

      // Cleanup legacy thumbnail keys
      if (key.startsWith('thumbnail_')) {
        keysToRemove.push(key);
        cleanedThumbnails++;
      }
    }

    keysToRemove.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    });
  } catch (e) {
    console.warn('[CacheManager] Error scanning localStorage:', e);
  }

  // 2. Process IndexedDB (large objects, movie_details, thumbnails)
  try {
    if (typeof indexedDB !== 'undefined') {
      await new Promise<void>((resolve) => {
        const req = indexedDB.open('moviznow_cache_db', 2);
        req.onerror = () => resolve();
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('cache')) {
            resolve();
            return;
          }

          try {
            const tx = db.transaction('cache', 'readwrite');
            const store = tx.objectStore('cache');
            const getAllKeysReq = store.getAllKeys();

            getAllKeysReq.onsuccess = () => {
              const keys = getAllKeysReq.result;
              keys.forEach((key: any) => {
                if (typeof key !== 'string') return;

                // Never touch chunk keys
                if (isProtectedChunkKey(key)) return;

                // Remove legacy thumbnails immediately
                if (key.startsWith('thumbnail_')) {
                  store.delete(key);
                  cleanedThumbnails++;
                  return;
                }

                // Check movie_details in IndexedDB (3-day TTL)
                if (key.startsWith('movie_details_')) {
                  const id = key.replace('movie_details_', '');
                  const lastUsed = getLastAccessTimestamp('meta', id);
                  if (lastUsed && (now - lastUsed >= CONTENT_METADATA_TTL_MS)) {
                    store.delete(key);
                    cleanedMetadata++;
                  }
                }
              });
              resolve();
            };
            getAllKeysReq.onerror = () => resolve();
          } catch (e) {
            resolve();
          }
        };
      });
    }
  } catch (e) {
    console.warn('[CacheManager] Error scanning IndexedDB:', e);
  }

  return { cleanedMetadata, cleanedRatingsOtt, cleanedThumbnails };
}

// Auto-run cleanup on module load after short delay
if (typeof window !== 'undefined') {
  setTimeout(() => {
    runPeriodicCacheCleanup().catch(() => {});
  }, 3000);
}
