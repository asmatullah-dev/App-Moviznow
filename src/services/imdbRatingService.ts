import { Content } from '../types';

export interface CachedImdbRating {
  id: string;
  rating: string; // e.g. "8.2" (clean number string)
  rawRating?: string; // e.g. "8.2/10"
  votes?: string;
  timestamp: number; // Unix timestamp in ms
  imdbId?: string;
}

const IMDB_STORAGE_PREFIX = 'imdb_rating_v2_';
const LEGACY_STORAGE_PREFIX = 'imdb_rating_';
export const RATING_CACHE_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days in milliseconds

const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY || '19daa310';
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || 'f71c2391161526fa9d19bd0b2759efaf';
const OMDB_BASE = 'https://www.omdbapi.com/';
const TMDB_BASE = 'https://api.themoviedb.org/3';

// In-flight fetch deduplication map
const pendingFetches = new Map<string, Promise<CachedImdbRating | null>>();

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
 * Get cached IMDb rating for a content item from localStorage if valid (< 5 days old).
 * If expired (> 5 days), deletes the old rating data from localStorage and returns null.
 */
export function getCachedImdbRating(contentId: string): CachedImdbRating | null {
  if (!contentId) return null;
  try {
    const key = `${IMDB_STORAGE_PREFIX}${contentId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const data: CachedImdbRating = JSON.parse(raw);
    if (!data || !data.rating) return null;

    const now = Date.now();
    // Delete old Ratings data after 5 days
    if (data.timestamp && now - data.timestamp >= RATING_CACHE_TTL_MS) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
      return null;
    }

    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Save an IMDb rating into localStorage with a 5-day expiration timestamp.
 * Dispatches a custom window event so all cards and preview components react instantly.
 */
export function saveImdbRatingToStorage(
  contentId: string,
  rawRating: string,
  imdbId?: string,
  votes?: string
): CachedImdbRating | null {
  if (!contentId) return null;

  const clean = formatImdbRating(rawRating);
  if (!clean) return null;

  const cachedData: CachedImdbRating = {
    id: contentId,
    rating: clean,
    rawRating: rawRating.includes('/10') ? rawRating : `${clean}/10`,
    votes,
    timestamp: Date.now(),
    imdbId
  };

  try {
    const key = `${IMDB_STORAGE_PREFIX}${contentId}`;
    localStorage.setItem(key, JSON.stringify(cachedData));

    // Also sync to legacy sessionStorage key for MovieDetails
    try {
      sessionStorage.setItem(`${LEGACY_STORAGE_PREFIX}${contentId}`, cachedData.rawRating || `${clean}/10`);
    } catch (e) {}

    // Dispatch global event for instant reactive UI updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('imdb_rating_updated', {
          detail: {
            contentId,
            rating: clean,
            rawRating: cachedData.rawRating,
            votes,
            timestamp: cachedData.timestamp
          }
        })
      );
    }

    return cachedData;
  } catch (e) {
    console.error('Failed to save IMDb rating to localStorage:', e);
    return cachedData;
  }
}

/**
 * Fetch live IMDb rating directly using OMDB / TMDB (same logic as MediaModal).
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

      // 1. If we don't have imdbId, try to find it via TMDB by Title + Year
      if (!imdbId && content.title) {
        try {
          const searchType = content.type === 'series' ? 'tv' : 'movie';
          const yearParam = content.year ? `&year=${content.year}` : '';
          const tmdbSearchUrl = `${TMDB_BASE}/search/${searchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
            content.title
          )}${yearParam}`;

          const tmdbRes = await fetch(tmdbSearchUrl);
          const tmdbData = await tmdbRes.json();

          if (tmdbData.results && tmdbData.results.length > 0) {
            const firstResult = tmdbData.results[0];
            const detailsRes = await fetch(
              `${TMDB_BASE}/${searchType}/${firstResult.id}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`
            );
            const detailsData = await detailsRes.json();
            if (detailsData.external_ids?.imdb_id) {
              imdbId = detailsData.external_ids.imdb_id;
            }
          }
        } catch (e) {
          // Ignore TMDB search error and proceed to OMDB title search
        }
      }

      // 2. Fetch from OMDB using imdbId (fastest & most accurate)
      if (imdbId) {
        try {
          const omdbUrl = `${OMDB_BASE}?i=${imdbId}&apikey=${OMDB_API_KEY}`;
          const omdbRes = await fetch(omdbUrl);
          const omdbData = await omdbRes.json();

          if (omdbData.Response === 'True' && omdbData.imdbRating && omdbData.imdbRating !== 'N/A') {
            return saveImdbRatingToStorage(content.id, omdbData.imdbRating, imdbId, omdbData.imdbVotes);
          }
        } catch (e) {
          console.error('OMDB fetch by IMDb ID failed:', e);
        }
      }

      // 3. Fallback: Fetch from OMDB by Title + Year
      if (content.title) {
        try {
          const yearParam = content.year ? `&y=${content.year}` : '';
          const typeParam = content.type === 'series' ? '&type=series' : '&type=movie';
          const omdbUrl = `${OMDB_BASE}?t=${encodeURIComponent(content.title)}${yearParam}${typeParam}&apikey=${OMDB_API_KEY}`;
          const omdbRes = await fetch(omdbUrl);
          const omdbData = await omdbRes.json();

          if (omdbData.Response === 'True' && omdbData.imdbRating && omdbData.imdbRating !== 'N/A') {
            return saveImdbRatingToStorage(content.id, omdbData.imdbRating, omdbData.imdbID, omdbData.imdbVotes);
          }
        } catch (e) {
          console.error('OMDB fetch by title failed:', e);
        }
      }

      // 4. If no live rating from API, but content already has a static imdbRating from DB, cache that
      if (content.imdbRating) {
        return saveImdbRatingToStorage(content.id, content.imdbRating, imdbId);
      }

      return null;
    } catch (err) {
      console.error('Failed to fetch live IMDb rating for content:', content.id, err);
      return null;
    } finally {
      pendingFetches.delete(content.id);
    }
  })();

  pendingFetches.set(content.id, fetchPromise);
  return fetchPromise;
}

/**
 * Trigger reload of IMDb rating on user action (e.g. Content Clicked or Preview opened).
 * Always reloads live from OMDB/TMDB in the background and saves fresh data with new timestamp.
 */
export function reloadLiveImdbRating(content: Partial<Content> & { id: string }): Promise<CachedImdbRating | null> {
  if (!content?.id) return Promise.resolve(null);
  return fetchLiveImdbRating(content);
}
