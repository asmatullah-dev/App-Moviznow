const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || 'f71c2391161526fa9d19bd0b2759efaf';

// In-memory client cache for fast response times and deduplication
const tmdbClientCache = new Map<string, { data: any; status: number; ok: boolean; timestamp: number }>();
const CLIENT_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Executes a TMDB API request through the server-side proxy (/api/tmdb/...)
 * with intelligent in-memory client caching.
 * Falls back to direct TMDB endpoint if proxy is temporarily unreachable.
 */
export async function fetchTmdb(endpointPath: string, queryParams: Record<string, string | number | boolean | undefined | null> = {}): Promise<Response> {
  const cleanPath = endpointPath.startsWith('/') ? endpointPath.slice(1) : endpointPath;
  
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== undefined && v !== null && v !== '' && k !== 'api_key') {
      searchParams.set(k, String(v));
    }
  }

  const queryString = searchParams.toString();
  const cacheKey = `${cleanPath}?${queryString}`;

  const cached = tmdbClientCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL) {
    return new Response(JSON.stringify(cached.data), {
      status: cached.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const proxyUrl = `/api/tmdb/${cleanPath}${queryString ? `?${queryString}` : ''}`;

  let res: Response | null = null;
  try {
    res = await fetch(proxyUrl);
  } catch (e) {
    // Network or proxy failure, fall back to direct request
  }

  if (!res || !res.ok) {
    // Direct fallback
    searchParams.set('api_key', TMDB_API_KEY);
    const directUrl = `${TMDB_BASE}/${cleanPath}?${searchParams.toString()}`;
    res = await fetch(directUrl);
  }

  if (res.ok) {
    try {
      const cloned = res.clone();
      const jsonData = await cloned.json();
      if (tmdbClientCache.size > 300) {
        const firstKey = tmdbClientCache.keys().next().value;
        if (firstKey) tmdbClientCache.delete(firstKey);
      }
      tmdbClientCache.set(cacheKey, {
        data: jsonData,
        status: res.status,
        ok: res.ok,
        timestamp: Date.now()
      });
    } catch (e) {}
  }

  return res;
}

