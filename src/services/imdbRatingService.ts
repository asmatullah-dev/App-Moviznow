import { Content } from '../types';
import { extractOttPlatformFromTMDBDetails, predictOttPlatformWithAI } from './tmdb';
import { touchImdbOttUsage } from './cacheManager';
import { fetchTmdb } from './tmdbClient';

export interface CachedImdbRating {
  id: string;
  rating: string; // e.g. "8.2" (clean number string)
  rawRating?: string; // e.g. "8.2/10"
  votes?: string;
  ottPlatform?: string; // e.g. "Netflix", "Prime Video"
  timestamp: number; // Unix timestamp in ms
  imdbId?: string;
}

const IMDB_STORAGE_PREFIX = 'imdb_rating_v2_';
const LEGACY_STORAGE_PREFIX = 'imdb_rating_';
export const RATING_CACHE_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days in milliseconds

const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY || '19daa310';
const OMDB_BASE = 'https://www.omdbapi.com/';

// In-flight fetch deduplication map
const pendingFetches = new Map<string, Promise<CachedImdbRating | null>>();
// In-memory hot cache to avoid repeated localStorage.getItem / JSON.parse operations
const inMemoryRatingCache = new Map<string, CachedImdbRating | null>();

/**
 * Format & clean raw IMDb rating string into clean format (e.g. "8.2/10" -> "8.2")
 */
export function formatImdbRating(raw?: string | null): string | null {
  if (!raw || raw === 'N/A' || raw === 'null' || raw === 'undefined') return null;
  const cleaned = raw.replace('/10', '').trim();
  const num = parseFloat(cleaned);
  if (isNaN(num) || num <= 0 || num > 10) return null;
  return num.toFixed(1).replace(/\.0$/, '');
}

/**
 * Clean up all expired IMDb ratings in localStorage older than 5 days
 */
export function cleanupExpiredImdbRatings(): void {
  try {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith(IMDB_STORAGE_PREFIX)) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const data: CachedImdbRating = JSON.parse(raw);
            if (!data.timestamp || now - data.timestamp >= RATING_CACHE_TTL_MS) {
              keysToRemove.push(key);
            }
          }
        } catch (e) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    });
  } catch (e) {
    console.error('Error during IMDb rating cache cleanup:', e);
  }
}

// Run cleanup periodically or on startup
if (typeof window !== 'undefined') {
  setTimeout(() => {
    cleanupExpiredImdbRatings();
  }, 1000);
}

/**
 * Get cached IMDb rating & OTT platform for a content item from memory/localStorage if valid (< 5 days old).
 * If expired (> 5 days), deletes the old rating data from localStorage and returns null.
 */
export function getCachedImdbRating(contentId: string): CachedImdbRating | null {
  if (!contentId) return null;

  if (inMemoryRatingCache.has(contentId)) {
    const mem = inMemoryRatingCache.get(contentId);
    if (mem && (!mem.timestamp || Date.now() - mem.timestamp < RATING_CACHE_TTL_MS)) {
      return mem;
    }
  }

  try {
    const key = `${IMDB_STORAGE_PREFIX}${contentId}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      inMemoryRatingCache.set(contentId, null);
      return null;
    }

    const data: CachedImdbRating = JSON.parse(raw);
    if (!data || (!data.rating && !data.ottPlatform)) {
      inMemoryRatingCache.set(contentId, null);
      return null;
    }

    const now = Date.now();
    // Delete old Ratings data after 5 days
    if (data.timestamp && now - data.timestamp >= RATING_CACHE_TTL_MS) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
      inMemoryRatingCache.set(contentId, null);
      return null;
    }

    touchImdbOttUsage(contentId);
    inMemoryRatingCache.set(contentId, data);
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Save an IMDb rating & OTT platform into localStorage with a 5-day expiration timestamp.
 * Dispatches a custom window event so all cards and preview components react instantly.
 */
export function saveImdbRatingToStorage(
  contentId: string,
  rawRating?: string | null,
  imdbId?: string,
  votes?: string,
  ottPlatform?: string | null
): CachedImdbRating | null {
  if (!contentId) return null;

  const existing = getCachedImdbRating(contentId);
  const clean = rawRating ? formatImdbRating(rawRating) : existing?.rating || null;
  const finalOtt = (ottPlatform && ottPlatform.trim()) ? ottPlatform.trim() : existing?.ottPlatform || undefined;

  if (!clean && !finalOtt) {
    inMemoryRatingCache.set(contentId, null);
    return null;
  }

  const cachedData: CachedImdbRating = {
    id: contentId,
    rating: clean || existing?.rating || '',
    rawRating: rawRating ? (rawRating.includes('/10') ? rawRating : `${clean}/10`) : existing?.rawRating,
    votes: votes || existing?.votes,
    ottPlatform: finalOtt,
    timestamp: Date.now(),
    imdbId: imdbId || existing?.imdbId
  };

  inMemoryRatingCache.set(contentId, cachedData);

  try {
    const key = `${IMDB_STORAGE_PREFIX}${contentId}`;
    localStorage.setItem(key, JSON.stringify(cachedData));

    // Also sync to legacy sessionStorage key for MovieDetails
    if (cachedData.rawRating) {
      try {
        sessionStorage.setItem(`${LEGACY_STORAGE_PREFIX}${contentId}`, cachedData.rawRating);
      } catch (e) {}
    }

    // Dispatch global event for instant reactive UI updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('imdb_rating_updated', {
          detail: {
            contentId,
            rating: cachedData.rating,
            rawRating: cachedData.rawRating,
            votes: cachedData.votes,
            ottPlatform: cachedData.ottPlatform,
            timestamp: cachedData.timestamp
          }
        })
      );
    }

    return cachedData;
  } catch (e) {
    console.error('Failed to save IMDb rating/OTT to localStorage:', e);
    return cachedData;
  }
}

/**
 * Fetch live IMDb rating and OTT platform directly using OMDB / TMDB / AI.
 * Saves live result to localStorage with the current timestamp.
 */
export async function fetchLiveImdbRating(
  content: Partial<Content> & { id: string }
): Promise<CachedImdbRating | null> {
  if (!content?.id) return null;

  // Deduplicate concurrent requests for the same content ID
  if (pendingFetches.has(content.id)) {
    return pendingFetches.get(content.id)!;
  }

  const fetchPromise = (async () => {
    try {
      let imdbId = content.imdbLink?.match(/tt\d+/)?.[0];
      let detectedOtt = content.ottPlatform || (content as any).ott_platform || null;
      const searchType = content.type === 'series' ? 'tv' : 'movie';

      let liveRating: string | null = null;
      let liveVotes: string | undefined = undefined;
      let tmdbRating: string | null = null;
      let tmdbVotes: string | undefined = undefined;

      // 1. If we don't have imdbId OR don't have ottPlatform, search TMDB by Title + Year
      if ((!imdbId || !detectedOtt) && content.title) {
        try {
          const tmdbRes = await fetchTmdb(`search/${searchType}`, {
            query: content.title,
            year: content.year || undefined
          });
          const tmdbData = await tmdbRes.json();

          if (tmdbData.results && tmdbData.results.length > 0) {
            const firstResult = tmdbData.results[0];
            const detailsRes = await fetchTmdb(`${searchType}/${firstResult.id}`, {
              append_to_response: 'external_ids,watch/providers'
            });
            const tmdbDetails = await detailsRes.json();

            if (tmdbDetails.external_ids?.imdb_id && !imdbId) {
              imdbId = tmdbDetails.external_ids.imdb_id;
            }
            if (!detectedOtt) {
              detectedOtt = extractOttPlatformFromTMDBDetails(tmdbDetails, searchType);
            }
            if (tmdbDetails.vote_average && tmdbDetails.vote_average > 0) {
              tmdbRating = Number(tmdbDetails.vote_average).toFixed(1);
              if (tmdbDetails.vote_count) tmdbVotes = String(tmdbDetails.vote_count);
            }
          }
        } catch (e) {
          // Ignore TMDB search error
        }
      }

      // 2. If still no OTT and we have content title, attempt AI prediction as fallback
      if (!detectedOtt && content.title) {
        try {
          detectedOtt = await predictOttPlatformWithAI(
            content.title,
            searchType,
            content.year ? String(content.year) : undefined,
            content.description,
            undefined,
            undefined,
            content.country
          );
        } catch (e) {}
      }

      // 3. Fetch rating from OMDB using imdbId (fastest & most accurate)
      if (imdbId) {
        try {
          let omdbRes = await fetch(`/api/omdb?i=${imdbId}`);
          if (!omdbRes.ok) {
            omdbRes = await fetch(`${OMDB_BASE}?i=${imdbId}&apikey=${OMDB_API_KEY}`);
          }
          const omdbData = await omdbRes.json();

          if (omdbData.Response === 'True' && omdbData.imdbRating && omdbData.imdbRating !== 'N/A') {
            liveRating = omdbData.imdbRating;
            liveVotes = omdbData.imdbVotes;
          }
        } catch (e) {
          console.error('OMDB fetch by IMDb ID failed:', e);
        }
      }

      // 4. Fallback: Fetch rating from OMDB by Title + Year
      if (!liveRating && content.title) {
        try {
          const yearParam = content.year ? `&y=${content.year}` : '';
          const typeParam = content.type === 'series' ? '&type=series' : '&type=movie';
          let omdbRes = await fetch(`/api/omdb?t=${encodeURIComponent(content.title)}${yearParam}${typeParam}`);
          if (!omdbRes.ok) {
            omdbRes = await fetch(`${OMDB_BASE}?t=${encodeURIComponent(content.title)}${yearParam}${typeParam}&apikey=${OMDB_API_KEY}`);
          }
          const omdbData = await omdbRes.json();

          if (omdbData.Response === 'True' && omdbData.imdbRating && omdbData.imdbRating !== 'N/A') {
            liveRating = omdbData.imdbRating;
            liveVotes = omdbData.imdbVotes;
            if (!imdbId && omdbData.imdbID) imdbId = omdbData.imdbID;
          }
        } catch (e) {
          console.error('OMDB fetch by title failed:', e);
        }
      }

      // 5. Fallback rating from TMDB if OMDB failed/rate-limited
      if (!liveRating && tmdbRating) {
        liveRating = tmdbRating;
        if (!liveVotes) liveVotes = tmdbVotes;
      }

      // 5. Fallback rating from static content
      if (!liveRating && content.imdbRating) {
        liveRating = content.imdbRating;
      }

      return saveImdbRatingToStorage(content.id, liveRating, imdbId, liveVotes, detectedOtt);
    } catch (err) {
      console.error('Failed to fetch live IMDb rating and OTT for content:', content.id, err);
      return null;
    } finally {
      pendingFetches.delete(content.id);
    }
  })();

  pendingFetches.set(content.id, fetchPromise);
  return fetchPromise;
}

/**
 * Trigger reload of IMDb rating & OTT platform on user action (e.g. Content Clicked or Preview opened).
 * Always reloads live from OMDB/TMDB in the background and saves fresh data with new timestamp.
 */
export function reloadLiveImdbRating(content: Partial<Content> & { id: string }): Promise<CachedImdbRating | null> {
  if (!content?.id) return Promise.resolve(null);
  return fetchLiveImdbRating(content);
}
