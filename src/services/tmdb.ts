export interface TMDBUpcomingItem {
  id: number;
  title: string;
  originalTitle?: string;
  type: 'movie' | 'tv';
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  releaseDate: string | null; // OTT release date if available
  ottReleaseDate: string | null;
  hasOttDate: boolean;
  ottPlatform?: string | null;
  voteAverage: number;
  voteCount: number;
  popularity: number;
  genreIds: number[];
  genres?: string[];
  trailerUrl?: string | null;
}

export interface TMDBImagesResult {
  posters: string[];
  backdrops: string[];
}

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || 'f71c2391161526fa9d19bd0b2759efaf';
const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';

export function normalizeOttPlatformName(raw?: string | null): string | null {
  if (!raw) return null;
  const str = raw.trim();
  const lower = str.toLowerCase();
  
  if (lower.includes('netflix')) return 'Netflix';
  if (lower.includes('amazon') || lower.includes('prime video') || lower.includes('prime')) return 'Amazon Prime';
  if (lower.includes('disney+') || lower.includes('disney plus') || lower.includes('disney')) return 'Disney+';
  if (lower.includes('apple tv') || lower.includes('apple')) return 'Apple TV+';
  if (lower.includes('hbo') || lower.includes('max')) return 'HBO Max';
  if (lower.includes('hulu')) return 'Hulu';
  if (lower.includes('paramount')) return 'Paramount+';
  if (lower.includes('peacock')) return 'Peacock';
  if (lower.includes('jiocinema') || lower.includes('jio cinema') || lower.includes('jio')) return 'JioCinema';
  if (lower.includes('hotstar')) return 'Hotstar';
  if (lower.includes('zee5')) return 'Zee5';
  if (lower.includes('sonyliv') || lower.includes('sony liv')) return 'SonyLIV';
  if (lower.includes('lionsgate')) return 'Lionsgate Play';
  if (lower.includes('viki') || lower.includes('rakuten')) return 'Rakuten Viki';
  if (lower.includes('crunchyroll')) return 'Crunchyroll';
  if (lower.includes('aha')) return 'Aha';
  if (lower.includes('hoichoi')) return 'Hoichoi';
  if (lower.includes('sun nxt') || lower.includes('sunnxt')) return 'Sun NXT';
  if (lower.includes('mx player') || lower.includes('mxplayer')) return 'MX Player';
  if (lower.includes('shemaroo')) return 'ShemarooMe';
  if (lower.includes('chaupal')) return 'Chaupal';
  
  return str.length > 20 ? str.slice(0, 20) : str;
}

let ottRateLimitCooldownUntil = 0;

/**
 * Predict or detect missing OTT platform using AI (Gemini)
 */
export async function predictOttPlatformWithAI(
  title: string,
  type: 'movie' | 'tv',
  year?: string | number,
  overview?: string,
  genres?: string[],
  originalTitle?: string,
  country?: string,
  language?: string
): Promise<string | null> {
  if (Date.now() < ottRateLimitCooldownUntil) {
    return null;
  }

  try {
    const cacheKey = `ai_ott_${type}_${title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    try {
      const cached = localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      if (cached) return cached === 'null' ? null : cached;
    } catch (e) {}

    const res = await fetch('/api/predict-ott', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, type, year, overview, genres, originalTitle, country, language })
    });

    if (res.status === 429) {
      ottRateLimitCooldownUntil = Date.now() + 60000;
      return null;
    }

    if (!res.ok) return null;
    const data = await res.json();
    const platform = normalizeOttPlatformName(data.platform);

    try {
      localStorage.setItem(cacheKey, platform || 'null');
      sessionStorage.setItem(cacheKey, platform || 'null');
    } catch (e) {}

    return platform;
  } catch (e) {
    return null;
  }
}


/**
 * Fetch all official posters and backdrops for a movie or TV series
 */
export async function fetchTMDBImages(id: number, type: 'movie' | 'tv'): Promise<TMDBImagesResult> {
  try {
    const url = `${TMDB_BASE}/${type}/${id}/images?api_key=${TMDB_API_KEY}&include_image_language=en,hi,null`;
    const res = await fetch(url);
    if (!res.ok) return { posters: [], backdrops: [] };
    const data = await res.json();
    
    const posters = (data.posters || [])
      .map((p: any) => p.file_path ? `https://image.tmdb.org/t/p/w500${p.file_path}` : null)
      .filter(Boolean) as string[];

    const backdrops = (data.backdrops || [])
      .map((b: any) => b.file_path ? `https://image.tmdb.org/t/p/original${b.file_path}` : null)
      .filter(Boolean) as string[];

    return { posters, backdrops };
  } catch (e) {
    console.error(`Error fetching images for ${type} ${id}:`, e);
    return { posters: [], backdrops: [] };
  }
}

const GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
};

export function getTMDBGenreNames(genreIds?: number[]): string[] {
  if (!genreIds || !Array.isArray(genreIds)) return [];
  return genreIds
    .map(id => GENRE_MAP[id])
    .filter(Boolean);
}

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Fetch digital / OTT upcoming release dates for a movie.
 * TMDB Release Types:
 * 1: Premiere, 2: Theatrical (limited), 3: Theatrical, 4: Digital (OTT/VOD), 5: Physical, 6: TV
 * Strictly ignores theatrical dates (types 1, 2, 3).
 */
export async function fetchMovieDigitalReleaseDate(movieId: number): Promise<{ ottDate: string | null; platformNote: string | null }> {
  try {
    const today = getTodayString();
    const url = `${TMDB_BASE}/movie/${movieId}?api_key=${TMDB_API_KEY}&append_to_response=release_dates,watch/providers`;
    const res = await fetch(url);
    if (!res.ok) return { ottDate: null, platformNote: null };
    const data = await res.json();
    
    const releaseDatesData = data.release_dates;
    const providersData = data['watch/providers']?.results;

    const ottDates: { date: string; country: string; note: string }[] = [];

    if (releaseDatesData?.results && Array.isArray(releaseDatesData.results)) {
      for (const countryObj of releaseDatesData.results) {
        if (!countryObj.release_dates || !Array.isArray(countryObj.release_dates)) continue;
        for (const rd of countryObj.release_dates) {
          if ((rd.type === 4 || rd.type === 6) && rd.release_date) {
            const dateStr = rd.release_date.split('T')[0];
            // Must be today or upcoming future date
            if (dateStr >= today) {
              ottDates.push({
                date: dateStr,
                country: countryObj.iso_3166_1,
                note: (rd.note || '').trim()
              });
            }
          }
        }
      }
    }

    let detectedPlatform: string | null = null;
    if (providersData) {
      const usProviders = providersData.US?.flatrate || providersData.US?.buy;
      const inProviders = providersData.IN?.flatrate || providersData.IN?.buy;
      const anyProvider = (usProviders && usProviders[0]?.provider_name) || (inProviders && inProviders[0]?.provider_name);
      if (anyProvider) {
        detectedPlatform = normalizeOttPlatformName(anyProvider);
      }
    }

    if (ottDates.length === 0) {
      return { ottDate: null, platformNote: detectedPlatform };
    }

    // Sort by earliest upcoming OTT date
    ottDates.sort((a, b) => a.date.localeCompare(b.date));
    const earliest = ottDates[0];
    const platform = normalizeOttPlatformName(earliest.note) || detectedPlatform;

    return {
      ottDate: earliest.date,
      platformNote: platform
    };
  } catch (e) {
    console.error(`Error fetching digital release dates for movie ${movieId}:`, e);
    return { ottDate: null, platformNote: null };
  }
}

/**
 * Fetches upcoming movies with digital/OTT releases starting from today onwards.
 * Strictly avoids showing theatrical release dates.
 */
export async function fetchUpcomingMovies(page: number = 1): Promise<TMDBUpcomingItem[]> {
  try {
    const today = getTodayString();
    // 1. Discover movies with digital releases (type 4) on or after today
    const digitalDiscoverUrl = `${TMDB_BASE}/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&sort_by=popularity.desc&include_adult=false&include_video=false&page=${page}&with_release_type=4&release_date.gte=${today}`;
    const res = await fetch(digitalDiscoverUrl);
    
    let rawMovies: any[] = [];
    if (res.ok) {
      const data = await res.json();
      rawMovies = data.results || [];
    }

    // If digital discover returned few results, also fetch /movie/upcoming to inspect for digital dates
    if (rawMovies.length < 10) {
      try {
        const upRes = await fetch(`${TMDB_BASE}/movie/upcoming?api_key=${TMDB_API_KEY}&language=en-US&page=${page}`);
        if (upRes.ok) {
          const upData = await upRes.json();
          const existingIds = new Set(rawMovies.map(m => m.id));
          (upData.results || []).forEach((m: any) => {
            if (!existingIds.has(m.id)) {
              rawMovies.push(m);
            }
          });
        }
      } catch (e) {}
    }

    // Fetch exact digital OTT release dates for each movie
    const formattedMovies = await Promise.all(
      rawMovies.slice(0, 20).map(async (item: any) => {
        const { ottDate, platformNote } = await fetchMovieDigitalReleaseDate(item.id);

        return {
          id: item.id,
          title: item.title || item.original_title || 'Untitled',
          originalTitle: item.original_title,
          type: 'movie' as const,
          posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
          backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
          overview: item.overview || '',
          // Strictly show OTT release date; never fallback to theatrical release dates
          releaseDate: ottDate,
          ottReleaseDate: ottDate,
          hasOttDate: !!ottDate,
          ottPlatform: platformNote,
          voteAverage: item.vote_average || 0,
          voteCount: item.vote_count || 0,
          popularity: item.popularity || 0,
          genreIds: item.genre_ids || [],
          genres: getTMDBGenreNames(item.genre_ids),
        };
      })
    );

    // Filter to upcoming contents:
    // Only return movies that have a confirmed upcoming OTT date (>= today)
    // or are genuinely in upcoming pipeline without showing theatrical dates
    return formattedMovies.sort((a, b) => {
      if (a.hasOttDate && b.hasOttDate && a.ottReleaseDate && b.ottReleaseDate) {
        return a.ottReleaseDate.localeCompare(b.ottReleaseDate);
      }
      if (a.hasOttDate) return -1;
      if (b.hasOttDate) return 1;
      return (b.popularity || 0) - (a.popularity || 0);
    });
  } catch (error) {
    console.error('Error fetching upcoming movies from TMDB:', error);
    return [];
  }
}

/**
 * Fetches upcoming TV series whose air/OTT release date is today or in the future.
 */
export async function fetchUpcomingTV(page: number = 1): Promise<TMDBUpcomingItem[]> {
  try {
    const today = getTodayString();
    const url = `${TMDB_BASE}/discover/tv?api_key=${TMDB_API_KEY}&language=en-US&sort_by=popularity.desc&include_null_first_air_dates=false&page=${page}&first_air_date.gte=${today}`;
    const res = await fetch(url);
    
    let rawShows: any[] = [];
    if (res.ok) {
      const data = await res.json();
      rawShows = data.results || [];
    }

    if (rawShows.length < 8 && page === 1) {
      try {
        const onAirRes = await fetch(`${TMDB_BASE}/tv/on_the_air?api_key=${TMDB_API_KEY}&language=en-US&page=1`);
        if (onAirRes.ok) {
          const onAirData = await onAirRes.json();
          const existingIds = new Set(rawShows.map(s => s.id));
          (onAirData.results || []).forEach((s: any) => {
            if (!existingIds.has(s.id) && s.first_air_date && s.first_air_date >= today) {
              rawShows.push(s);
            }
          });
        }
      } catch (e) {}
    }

    const filteredShows = rawShows.filter((item: any) => {
      return item.first_air_date && item.first_air_date >= today;
    });

    const formattedShows: TMDBUpcomingItem[] = await Promise.all(
      filteredShows.slice(0, 20).map(async (item: any) => {
        const airDate = item.first_air_date || null;
        let detectedNetwork: string | null = null;
        
        try {
          const detailRes = await fetch(`${TMDB_BASE}/tv/${item.id}?api_key=${TMDB_API_KEY}&append_to_response=watch/providers`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            const primaryNetwork = detailData.networks?.[0]?.name;
            const providers = detailData['watch/providers']?.results?.US?.flatrate?.[0]?.provider_name || detailData['watch/providers']?.results?.IN?.flatrate?.[0]?.provider_name;
            detectedNetwork = normalizeOttPlatformName(primaryNetwork || providers);
          }
        } catch (e) {}

        return {
          id: item.id,
          title: item.name || item.original_name || 'Untitled',
          originalTitle: item.original_name,
          type: 'tv' as const,
          posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
          backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
          overview: item.overview || '',
          releaseDate: airDate,
          ottReleaseDate: airDate,
          hasOttDate: !!airDate,
          ottPlatform: detectedNetwork,
          voteAverage: item.vote_average || 0,
          voteCount: item.vote_count || 0,
          popularity: item.popularity || 0,
          genreIds: item.genre_ids || [],
          genres: getTMDBGenreNames(item.genre_ids),
        };
      })
    );

    // Sort chronologically (closest air date first)
    return formattedShows.sort((a, b) => {
      if (a.releaseDate && b.releaseDate) {
        return a.releaseDate.localeCompare(b.releaseDate);
      }
      return (b.popularity || 0) - (a.popularity || 0);
    });
  } catch (error) {
    console.error('Error fetching upcoming TV from TMDB:', error);
    return [];
  }
}

/**
 * Fetches combined upcoming movies & series sorted chronologically by upcoming release date.
 */
export async function fetchUpcomingCombined(filter: 'all' | 'movie' | 'tv' = 'all'): Promise<TMDBUpcomingItem[]> {
  if (filter === 'movie') {
    return await fetchUpcomingMovies(1);
  }
  if (filter === 'tv') {
    return await fetchUpcomingTV(1);
  }

  const [movies, tvShows] = await Promise.all([
    fetchUpcomingMovies(1),
    fetchUpcomingTV(1)
  ]);

  const combined = [...movies, ...tvShows];
  
  // Sort chronologically by earliest confirmed upcoming date, then by popularity
  return combined.sort((a, b) => {
    if (a.hasOttDate && b.hasOttDate && a.releaseDate && b.releaseDate) {
      return a.releaseDate.localeCompare(b.releaseDate);
    }
    if (a.hasOttDate) return -1;
    if (b.hasOttDate) return 1;
    return (b.popularity || 0) - (a.popularity || 0);
  });
}

/**
 * Multi-tier Trailer Selection
 */
export function getBestTrailerFromVideos(videos: any[]): string | null {
  if (!videos || !Array.isArray(videos)) return null;
  const youtubeVideos = videos.filter(v => v.site === 'YouTube' && v.key);
  if (youtubeVideos.length === 0) return null;

  const hindiVideos = youtubeVideos.filter(v => v.iso_639_1 === 'hi');
  const englishVideos = youtubeVideos.filter(v => v.iso_639_1 === 'en' || v.iso_639_1 === 'en-US');

  const searchInSet = (set: any[]) => {
    let best = set.find(v => v.type === 'Trailer' && v.official);
    if (best) return best;
    best = set.find(v => v.type === 'Trailer');
    if (best) return best;
    best = set.find(v => v.type === 'Teaser' && v.official);
    if (best) return best;
    best = set.find(v => v.type === 'Teaser');
    if (best) return best;
    best = set.find(v => v.type === 'Clip' || v.type === 'Featurette');
    if (best) return best;
    return set[0] || null;
  };

  const bestHindi = searchInSet(hindiVideos);
  if (bestHindi) return `https://www.youtube.com/watch?v=${bestHindi.key}`;

  const bestEnglish = searchInSet(englishVideos);
  if (bestEnglish) return `https://www.youtube.com/watch?v=${bestEnglish.key}`;

  const bestAny = searchInSet(youtubeVideos);
  return bestAny ? `https://www.youtube.com/watch?v=${bestAny.key}` : null;
}

export async function fetchKinoCheckTrailer(tmdbId: number, type: 'movie' | 'tv'): Promise<string | null> {
  try {
    const endpoint = type === 'tv' ? 'shows' : 'movies';
    const languages = ['hi', 'en', ''];
    for (const lang of languages) {
      try {
        const langParam = lang ? `&language=${lang}` : '';
        const res = await fetch(`https://api.kinocheck.de/${endpoint}?tmdb_id=${tmdbId}${langParam}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.trailer?.youtube_video_id) {
            return `https://www.youtube.com/watch?v=${data.trailer.youtube_video_id}`;
          }
        }
      } catch (e) {}
    }
  } catch (e) {
    console.error('KinoCheck fetch error:', e);
  }
  return null;
}

export async function searchYouTubeTrailer(title: string, type: 'movie' | 'tv'): Promise<string | null> {
  if (!YOUTUBE_API_KEY) return null;
  try {
    const typeLabel = type === 'tv' ? 'Series' : 'Movie';
    const query = `${title} ${typeLabel} Official Trailer`;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}&maxResults=3`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      return `https://www.youtube.com/watch?v=${data.items[0].id.videoId}`;
    }
  } catch (e) {
    console.error('YouTube Search API error:', e);
  }
  return null;
}

export async function fetchTMDBTrailer(id: number, type: 'movie' | 'tv', title?: string): Promise<string | null> {
  try {
    // 1. TMDB videos with multi-language
    const url = `${TMDB_BASE}/${type}/${id}/videos?api_key=${TMDB_API_KEY}&include_video_language=hi,en,es,fr,de,ja,ko,null`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const tmdbTrailer = getBestTrailerFromVideos(data.results || []);
      if (tmdbTrailer) return tmdbTrailer;
    }

    // 2. KinoCheck fallback
    const kinoTrailer = await fetchKinoCheckTrailer(id, type);
    if (kinoTrailer) return kinoTrailer;

    // 3. YouTube API search fallback
    if (title) {
      const ytTrailer = await searchYouTubeTrailer(title, type);
      if (ytTrailer) return ytTrailer;
    }

    return null;
  } catch (e) {
    console.error('Error fetching trailer:', e);
    return null;
  }
}
