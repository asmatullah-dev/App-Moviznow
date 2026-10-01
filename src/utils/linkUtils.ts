import { safeStorage } from './safeStorage';
import { HUBCLOUD_DOMAIN, HUBDRIVE_DOMAIN } from './domains';

export interface CachedExtractionResult {
  url: string;
  candidates?: { text: string; href: string }[];
  size?: string;
  timestamp: number;
  isCloudflare?: boolean;
}

const EXTRACTION_CACHE_KEY = 'hubcloud_extraction_cache';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Normalizes movie/series link URLs to active domains (HubCloud, HubDrive, etc.)
 */
export function normalizeContentUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let urlStr = rawUrl.trim();

  // If missing protocol, add https
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://') && !urlStr.startsWith('tg://')) {
    urlStr = 'https://' + urlStr;
  }

  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();

    // Map legacy HubCloud hosts
    if (
      host.includes('hubcould') ||
      host.includes('hubcloud.one') ||
      host.includes('hubcloud.foo') ||
      host.includes('hubcloud.cx') ||
      host.includes('hubcloud.club') ||
      (host.includes('hubcloud') && !host.includes('hubcloud.ist'))
    ) {
      parsed.hostname = 'hubcloud.ist';
      return parsed.toString();
    }

    // Map legacy HubDrive hosts
    if (host.includes('hubdrive') && !host.includes('hubdrive.space')) {
      parsed.hostname = 'hubdrive.space';
      return parsed.toString();
    }

    return parsed.toString();
  } catch (e) {
    // If URL parsing fails, attempt regex fallback
    return urlStr
      .replace(/https?:\/\/(?:www\.)?(?:hubcloud\.one|hubcloud\.foo|hubcould\.\w+|hubcloud\.cx)/gi, HUBCLOUD_DOMAIN)
      .replace(/https?:\/\/(?:www\.)?hubdrive\.\w+/gi, HUBDRIVE_DOMAIN);
  }
}

/**
 * Reads from the link extraction cache safely
 */
export function getCachedLinkExtraction(url: string): CachedExtractionResult | null {
  if (!url) return null;
  const normalized = normalizeContentUrl(url);

  try {
    const raw = safeStorage.getItem(EXTRACTION_CACHE_KEY);
    if (!raw) return null;

    const cache: Record<string, CachedExtractionResult> = JSON.parse(raw);
    const cached = cache[url] || cache[normalized];
    if (!cached) return null;

    // Check expiry
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached;
    }
  } catch (e) {
    // Suppress parse errors
  }

  return null;
}

/**
 * Saves a link extraction result safely to cache, pruning expired entries to maintain quota
 */
export function saveCachedLinkExtraction(
  url: string,
  data: {
    finalUrl: string;
    finalCandidates?: { text: string; href: string }[];
    finalSize?: string;
    isCloudflare?: boolean;
  }
): void {
  if (!url || !data?.finalUrl) return;
  const normalized = normalizeContentUrl(url);

  try {
    const raw = safeStorage.getItem(EXTRACTION_CACHE_KEY);
    const cache: Record<string, CachedExtractionResult> = raw ? JSON.parse(raw) : {};
    const now = Date.now();

    // Prune entries older than TTL
    const cleanCache: Record<string, CachedExtractionResult> = {};
    for (const key in cache) {
      if (now - cache[key].timestamp < CACHE_TTL_MS) {
        cleanCache[key] = cache[key];
      }
    }

    const payload: CachedExtractionResult = {
      url: data.finalUrl,
      candidates: data.finalCandidates,
      size: data.finalSize,
      isCloudflare: data.isCloudflare,
      timestamp: now,
    };

    cleanCache[url] = payload;
    if (normalized !== url) {
      cleanCache[normalized] = payload;
    }

    safeStorage.setItem(EXTRACTION_CACHE_KEY, JSON.stringify(cleanCache));
  } catch (e) {
    console.error('Failed to cache link extraction safely', e);
  }
}
