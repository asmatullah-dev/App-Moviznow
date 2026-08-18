const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || 'f71c2391161526fa9d19bd0b2759efaf';

/**
 * Executes a TMDB API request through the server-side proxy (/api/tmdb/...)
 * so that no secret API key is exposed in client network inspection.
 * Falls back to direct TMDB endpoint if proxy is temporarily unreachable.
 * 
 * NOTE: This interacts strictly with TMDB and does NOT consume Firestore reads/writes.
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
  const proxyUrl = `/api/tmdb/${cleanPath}${queryString ? `?${queryString}` : ''}`;

  try {
    const res = await fetch(proxyUrl);
    if (res.ok) {
      return res;
    }
  } catch (e) {
    // Network or proxy failure, fall back to direct request
  }

  // Direct fallback
  searchParams.set('api_key', TMDB_API_KEY);
  const directUrl = `${TMDB_BASE}/${cleanPath}?${searchParams.toString()}`;
  return fetch(directUrl);
}
