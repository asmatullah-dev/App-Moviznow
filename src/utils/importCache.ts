import { safeStorage } from './safeStorage';
import { ScrapedLinkItem } from './linkSelector';
import { QualityLinks } from '../types';
import { LinkCheckResult } from './linkScanner';

export const IMPORT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes in milliseconds
const CACHE_REGISTRY_KEY = 'bulk_import_cache_registry_v1';
const CACHE_KEY_PREFIX = 'import_cache_item_';

export interface ImportCacheEntry {
  cacheKey: string;
  title: string;
  cleanTitle: string;
  year?: number;
  type: 'movie' | 'series';
  cachedAt: number;
  expiresAt: number;
  tmdbData?: any;
  links: ScrapedLinkItem[];
  qualityLinks: QualityLinks;
  checkResults?: LinkCheckResult[];
  sample?: ScrapedLinkItem;
  metadata?: any;
}

export function normalizeCacheKey(title: string, year?: number | string): string {
  const normTitle = (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
  const normYear = year ? String(year).trim() : '';
  return `${normTitle}${normYear ? `_${normYear}` : ''}`;
}

function getRegistry(): string[] {
  try {
    const raw = safeStorage.getItem(CACHE_REGISTRY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveRegistry(keys: string[]) {
  try {
    safeStorage.setItem(CACHE_REGISTRY_KEY, JSON.stringify(Array.from(new Set(keys))));
  } catch (e) {
    console.error('Failed to save import cache registry:', e);
  }
}

/**
 * Prune all cache entries older than 30 minutes.
 */
export function pruneExpiredImportCache(): void {
  try {
    const registry = getRegistry();
    if (registry.length === 0) return;

    const now = Date.now();
    const remainingKeys: string[] = [];

    for (const key of registry) {
      const fullStorageKey = `${CACHE_KEY_PREFIX}${key}`;
      const raw = safeStorage.getItem(fullStorageKey);
      if (!raw) continue;

      try {
        const item: ImportCacheEntry = JSON.parse(raw);
        if (now > item.expiresAt) {
          // Expired after 30 mins, delete
          safeStorage.removeItem(fullStorageKey);
        } else {
          remainingKeys.push(key);
        }
      } catch (err) {
        safeStorage.removeItem(fullStorageKey);
      }
    }

    saveRegistry(remainingKeys);
  } catch (e) {
    console.error('Error during import cache pruning:', e);
  }
}

/**
 * Retrieve cached waterfall & TMDB data for a title and optional year.
 * Returns null if not cached or expired (>30 mins).
 */
export function getImportCache(
  title: string,
  year?: number | string
): ImportCacheEntry | null {
  if (!title || !title.trim()) return null;

  const key = normalizeCacheKey(title, year);
  const fullStorageKey = `${CACHE_KEY_PREFIX}${key}`;
  const raw = safeStorage.getItem(fullStorageKey);

  if (!raw) return null;

  try {
    const item: ImportCacheEntry = JSON.parse(raw);
    const now = Date.now();

    // Check 30-minute expiration
    if (now > item.expiresAt) {
      removeImportCache(title, year);
      return null;
    }

    return item;
  } catch (e) {
    removeImportCache(title, year);
    return null;
  }
}

/**
 * Save waterfall search result & TMDB data to cache with 30-minute auto-expiry.
 */
export function saveImportCache(
  data: Omit<ImportCacheEntry, 'cacheKey' | 'cachedAt' | 'expiresAt'>
): void {
  if (!data.title && !data.cleanTitle) return;

  const titleToUse = data.title || data.cleanTitle;
  const key = normalizeCacheKey(titleToUse, data.year);
  const fullStorageKey = `${CACHE_KEY_PREFIX}${key}`;

  const now = Date.now();
  const entry: ImportCacheEntry = {
    ...data,
    cacheKey: key,
    cachedAt: now,
    expiresAt: now + IMPORT_CACHE_TTL_MS,
  };

  try {
    safeStorage.setItem(fullStorageKey, JSON.stringify(entry));
    const registry = getRegistry();
    if (!registry.includes(key)) {
      registry.push(key);
      saveRegistry(registry);
    }
  } catch (e) {
    console.error('Failed to save import cache entry:', e);
  }
}

/**
 * Explicitly delete an entry from cache once the content has been saved to the library.
 */
export function removeImportCache(title: string, year?: number | string): void {
  if (!title) return;
  const key = normalizeCacheKey(title, year);
  const fullStorageKey = `${CACHE_KEY_PREFIX}${key}`;

  try {
    safeStorage.removeItem(fullStorageKey);
    const registry = getRegistry();
    const updated = registry.filter((k) => k !== key);
    saveRegistry(updated);
  } catch (e) {
    console.error('Failed to remove import cache entry:', e);
  }
}

// Automatically schedule periodic cache pruning every 5 minutes
if (typeof window !== 'undefined') {
  setTimeout(() => pruneExpiredImportCache(), 1000);
  setInterval(() => pruneExpiredImportCache(), 5 * 60 * 1000);
}
