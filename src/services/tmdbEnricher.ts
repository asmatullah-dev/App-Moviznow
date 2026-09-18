import { Content, Genre, Language, Quality, QualityLinks, Season } from '../types';
import { extractTitleAndYear } from '../utils/titleMatcher';
import {
  searchTMDBByTitle,
  fetchTMDBDetails,
  fetchSeriesSeasons,
  fetchIMDbRating,
  getBestTrailer,
  fetchKinoCheckTrailer,
  searchYouTubeTrailer,
  getBestAlternativeTitle,
} from '../components/MediaModal';
import {
  extractOttPlatformFromTMDBDetails,
  fetchMovieDigitalReleaseDate,
  predictOttPlatformWithAI,
} from './tmdb';

export interface BatchMediaPreferences {
  title: boolean;
  secondTitle: boolean;
  description: boolean;
  type: boolean;
  year: boolean;
  releaseDate: boolean;
  country: boolean;
  runtime: boolean;
  imdbRating: boolean;
  imdbLink: boolean;
  trailerUrl: boolean;
  cast: boolean;
  genres: boolean;
  seasons: boolean;
  episodes: boolean;
  posterUrl: boolean;
  ottPlatform: boolean;
}

export const DEFAULT_BATCH_PREFERENCES: BatchMediaPreferences = {
  title: true,
  secondTitle: true,
  description: true,
  type: true,
  year: true,
  releaseDate: true,
  country: true,
  runtime: true,
  imdbRating: true,
  imdbLink: true,
  trailerUrl: true,
  cast: true,
  genres: true,
  seasons: true,
  episodes: true,
  posterUrl: true,
  ottPlatform: true,
};

/**
 * Reads preferences defined in Batch Media Modal (saved in localStorage under 'batchFetchModal_fetchFields').
 */
export function getBatchMediaPreferences(): BatchMediaPreferences {
  try {
    const saved = localStorage.getItem('batchFetchModal_fetchFields');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        title: parsed.title !== undefined ? Boolean(parsed.title) : true,
        secondTitle: parsed.secondTitle !== undefined ? Boolean(parsed.secondTitle) : true,
        description: parsed.description !== undefined ? Boolean(parsed.description) : true,
        type: parsed.type !== undefined ? Boolean(parsed.type) : true,
        year: parsed.year !== undefined ? Boolean(parsed.year) : true,
        releaseDate: parsed.releaseDate !== undefined ? Boolean(parsed.releaseDate) : true,
        country: parsed.country !== undefined ? Boolean(parsed.country) : true,
        runtime: parsed.runtime !== undefined ? Boolean(parsed.runtime) : true,
        imdbRating: parsed.imdbRating !== undefined ? Boolean(parsed.imdbRating) : true,
        imdbLink: parsed.imdbLink !== undefined ? Boolean(parsed.imdbLink) : true,
        trailerUrl: parsed.trailerUrl !== undefined ? Boolean(parsed.trailerUrl) : true,
        cast: parsed.cast !== undefined ? Boolean(parsed.cast) : true,
        genres: parsed.genres !== undefined ? Boolean(parsed.genres) : true,
        seasons: parsed.seasons !== undefined ? Boolean(parsed.seasons) : true,
        episodes: parsed.episodes !== undefined ? Boolean(parsed.episodes) : true,
        posterUrl: parsed.posterUrl !== undefined ? Boolean(parsed.posterUrl) : true,
        ottPlatform: parsed.ottPlatform !== undefined ? Boolean(parsed.ottPlatform) : true,
      };
    }
  } catch (e) {
    console.error('Failed to parse batchFetchModal_fetchFields:', e);
  }
  return { ...DEFAULT_BATCH_PREFERENCES };
}

export interface VerifiedTmdbMetadata {
  verified: boolean;
  tmdbId?: number;
  type: 'movie' | 'series';
  title: string;
  secondTitle?: string;
  year?: number;
  releaseDate?: string;
  overview?: string;
  description?: string;
  posterUrl?: string;
  backdropUrl?: string;
  trailerUrl?: string;
  country?: string;
  runtime?: string;
  imdbId?: string;
  imdbRating?: string;
  imdbLink?: string;
  cast: string[];
  genres: { id?: string; name: string }[];
  ottPlatform?: string;
  seasons?: Season[];
  rawDetails?: any;
}

/**
 * Verify title against TMDB and fetch full metadata (cast, OTT, trailer, rating, overview, etc.)
 */
export async function verifyAndFetchTmdbData(
  title: string,
  year?: number | string,
  forceType?: 'movie' | 'series'
): Promise<VerifiedTmdbMetadata | null> {
  if (!title || !title.trim()) return null;

  const cleanQuery = title
    .replace(/\s*\(\s*(19\d\d|20[0-2]\d)\s*\)\s*/gi, ' ')
    .replace(/\s*\[\s*(19\d\d|20[0-2]\d)\s*\]\s*/gi, ' ')
    .replace(/\b(19\d\d|20[0-2]\d)\b/g, ' ')
    .replace(/[🎬]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const searchYear = year ? String(year).trim() : '';
  const searchType = forceType === 'series' ? 'series' : forceType === 'movie' ? 'movie' : 'all';

  try {
    // 1. Search TMDB
    let tmdbResults = await searchTMDBByTitle(cleanQuery, searchYear, searchType);
    if ((!tmdbResults || tmdbResults.length === 0) && cleanQuery.includes(':')) {
      tmdbResults = await searchTMDBByTitle(cleanQuery.split(':')[0].trim(), searchYear, searchType);
    }
    if ((!tmdbResults || tmdbResults.length === 0) && searchYear) {
      // Fallback search without year
      tmdbResults = await searchTMDBByTitle(cleanQuery, '', searchType);
    }

    if (!tmdbResults || tmdbResults.length === 0) {
      return null;
    }

    // 2. Select best match
    const targetYearNum = searchYear ? parseInt(searchYear, 10) : NaN;
    const normalizeStr = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetTitleNorm = normalizeStr(cleanQuery);

    let bestMatch = tmdbResults[0];

    // Check for exact title and year match
    const exactTitleYear = tmdbResults.find((res: any) => {
      const matchTitle = normalizeStr(res.item.title || res.item.name || res.item.original_title || res.item.original_name);
      const matchYear = (res.item.release_date || res.item.first_air_date || '').split('-')[0];
      return matchTitle === targetTitleNorm && (!searchYear || matchYear === searchYear);
    });

    if (exactTitleYear) {
      bestMatch = exactTitleYear;
    } else if (!isNaN(targetYearNum)) {
      const closeYear = tmdbResults.find((res: any) => {
        const matchTitle = normalizeStr(res.item.title || res.item.name || res.item.original_title || res.item.original_name);
        const matchYearNum = parseInt((res.item.release_date || res.item.first_air_date || '').split('-')[0], 10);
        return matchTitle === targetTitleNorm && !isNaN(matchYearNum) && Math.abs(matchYearNum - targetYearNum) <= 2;
      });
      if (closeYear) bestMatch = closeYear;
    }

    const top = bestMatch.item;
    const mediaType: 'movie' | 'series' =
      top.media_type === 'tv' || bestMatch.type === 'tv' || top.first_air_date ? 'series' : 'movie';
    const tmdbId = top.id;

    // 3. Fetch Full Details
    const details = await fetchTMDBDetails(String(tmdbId), mediaType === 'series' ? 'tv' : 'movie');
    if (!details) {
      return null;
    }

    const canonicalTitle = details.title || details.name || top.title || top.name || cleanQuery;
    const releaseDate = details.release_date || details.first_air_date || top.release_date || top.first_air_date || '';
    const parsedYear = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : (!isNaN(targetYearNum) ? targetYearNum : undefined);

    // Alternative Title
    const altTitle = getBestAlternativeTitle(details);
    const secondTitle = altTitle && altTitle.toLowerCase() !== canonicalTitle.toLowerCase() ? altTitle : undefined;

    // Cast extraction
    const castNames: string[] = [];
    if (details.credits?.cast && Array.isArray(details.credits.cast)) {
      details.credits.cast.slice(0, 10).forEach((actor: any) => {
        if (actor?.name) castNames.push(actor.name.trim());
      });
    }

    // Genres extraction
    const genresList: { id?: string; name: string }[] = [];
    if (details.genres && Array.isArray(details.genres)) {
      details.genres.forEach((g: any) => {
        if (g?.name) genresList.push({ name: g.name.trim() });
      });
    }

    // Country extraction
    const country =
      details.production_countries?.[0]?.name ||
      details.origin_country?.[0] ||
      undefined;

    // Runtime extraction
    const rt = details.runtime
      ? `${details.runtime} min`
      : details.episode_run_time?.[0]
      ? `${details.episode_run_time[0]} min`
      : undefined;

    // Poster and Backdrop URLs
    const posterUrl = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : undefined;
    const backdropUrl = details.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : undefined;

    // Parallel extraction for Trailer, IMDb Rating, Seasons, OTT
    let trailerUrl = getBestTrailer(details.videos) || '';
    let imdbRating = '';
    let imdbLink = details.external_ids?.imdb_id ? `https://www.imdb.com/title/${details.external_ids.imdb_id}` : undefined;
    let seasonsData: Season[] | undefined = undefined;

    const parallelTasks: Promise<any>[] = [];

    // KinoCheck trailer fallback
    let kinocheckTaskIdx = -1;
    if (!trailerUrl && tmdbId) {
      parallelTasks.push(fetchKinoCheckTrailer(String(tmdbId), mediaType === 'series' ? 'tv' : 'movie'));
      kinocheckTaskIdx = parallelTasks.length - 1;
    }

    // IMDb Rating
    let imdbRatingTaskIdx = -1;
    if (details.external_ids?.imdb_id) {
      parallelTasks.push(fetchIMDbRating(details.external_ids.imdb_id));
      imdbRatingTaskIdx = parallelTasks.length - 1;
    }

    // Series Seasons
    let seasonsTaskIdx = -1;
    if (mediaType === 'series' && details.seasons) {
      parallelTasks.push(fetchSeriesSeasons(String(tmdbId), details.seasons));
      seasonsTaskIdx = parallelTasks.length - 1;
    }

    const parallelResults = await Promise.all(parallelTasks);

    if (kinocheckTaskIdx !== -1 && parallelResults[kinocheckTaskIdx]) {
      trailerUrl = parallelResults[kinocheckTaskIdx];
    }
    if (!trailerUrl) {
      // YouTube fallback trailer
      const ytResults = await searchYouTubeTrailer(canonicalTitle, mediaType === 'series' ? 'tv' : 'movie');
      if (ytResults && ytResults.length > 0) {
        trailerUrl = ytResults[0].url;
      }
    }

    if (imdbRatingTaskIdx !== -1 && parallelResults[imdbRatingTaskIdx]) {
      const r = parallelResults[imdbRatingTaskIdx];
      if (r?.rating && r.rating !== 'N/A') {
        imdbRating = `${r.rating}/10`;
      }
    }

    if (seasonsTaskIdx !== -1 && parallelResults[seasonsTaskIdx]) {
      seasonsData = parallelResults[seasonsTaskIdx];
    }

    // OTT Platform Detection
    let detectedOtt = extractOttPlatformFromTMDBDetails(details, mediaType === 'series' ? 'tv' : 'movie');
    if (!detectedOtt && details.id && mediaType === 'movie') {
      const { platformNote } = await fetchMovieDigitalReleaseDate(details.id);
      if (platformNote) detectedOtt = platformNote;
    }
    if (!detectedOtt) {
      detectedOtt = await predictOttPlatformWithAI(
        canonicalTitle,
        mediaType === 'series' ? 'tv' : 'movie',
        parsedYear ? String(parsedYear) : '',
        details.overview,
        genresList.map((g) => g.name),
        details.original_title || details.original_name,
        country
      );
    }

    return {
      verified: true,
      tmdbId,
      type: mediaType,
      title: canonicalTitle,
      secondTitle,
      year: parsedYear,
      releaseDate,
      overview: details.overview || '',
      description: details.overview || '',
      posterUrl,
      backdropUrl,
      trailerUrl,
      country,
      runtime: rt,
      imdbId: details.external_ids?.imdb_id,
      imdbRating,
      imdbLink,
      cast: castNames,
      genres: genresList,
      ottPlatform: detectedOtt || undefined,
      seasons: seasonsData,
      rawDetails: details,
    };
  } catch (err) {
    console.error(`Failed to verify TMDB data for "${title}":`, err);
    return null;
  }
}

/**
 * Builds or enriches a Content object applying user's Batch Media Modal preferences.
 */
export function applyPreferencesToContent(
  baseContent: Partial<Content> & {
    cleanTitle?: string;
    discoveredLinks?: any[];
    qualityLinks?: QualityLinks;
    sampleUrl?: string;
  },
  tmdbData: VerifiedTmdbMetadata | null | undefined,
  preferences: BatchMediaPreferences,
  availableGenres: Genre[] = [],
  availableLanguages: Language[] = [],
  availableQualities: Quality[] = []
): Content {
  const p = preferences;

  // Title
  let rawTitle = tmdbData?.title || baseContent.cleanTitle || baseContent.title || 'Untitled';
  if (p.title && tmdbData?.title) {
    rawTitle = tmdbData.title;
  }
  let finalTitle = extractTitleAndYear(rawTitle).title || rawTitle;

  // Second Title
  let finalSecondTitle = baseContent.secondTitle || '';
  if (p.secondTitle && tmdbData?.secondTitle) {
    finalSecondTitle = tmdbData.secondTitle;
  }

  // Type
  let finalType: 'movie' | 'series' = baseContent.type || 'movie';
  if (p.type && tmdbData?.type) {
    finalType = tmdbData.type;
  }

  // Year
  let finalYear = baseContent.year || new Date().getFullYear();
  if (p.year && tmdbData?.year) {
    finalYear = tmdbData.year;
  }

  // Description / Overview
  let finalDescription = baseContent.description || '';
  if (p.description && (tmdbData?.overview || tmdbData?.description)) {
    finalDescription = tmdbData.overview || tmdbData.description || '';
  }

  // Release Date
  let finalReleaseDate = baseContent.releaseDate || '';
  if (p.releaseDate && tmdbData?.releaseDate) {
    finalReleaseDate = tmdbData.releaseDate;
  }

  // Country
  let finalCountry = baseContent.country || '';
  if (p.country && tmdbData?.country) {
    finalCountry = tmdbData.country;
  }

  // Runtime
  let finalRuntime = baseContent.runtime || '';
  if (p.runtime && tmdbData?.runtime) {
    finalRuntime = tmdbData.runtime;
  }

  // Poster URL
  let finalPosterUrl = baseContent.posterUrl || '';
  if (p.posterUrl && tmdbData?.posterUrl) {
    finalPosterUrl = tmdbData.posterUrl;
  }

  // Trailer URL
  let finalTrailerUrl = baseContent.trailerUrl || '';
  if (p.trailerUrl && tmdbData?.trailerUrl) {
    finalTrailerUrl = tmdbData.trailerUrl;
  }

  // IMDb Rating
  let finalImdbRating = baseContent.imdbRating || '';
  if (p.imdbRating && tmdbData?.imdbRating) {
    finalImdbRating = tmdbData.imdbRating;
  }

  // IMDb Link
  let finalImdbLink = baseContent.imdbLink || '';
  if (p.imdbLink && tmdbData?.imdbLink) {
    finalImdbLink = tmdbData.imdbLink;
  }

  // OTT Platform
  let finalOttPlatform = baseContent.ottPlatform || null;
  if (p.ottPlatform && tmdbData?.ottPlatform) {
    finalOttPlatform = tmdbData.ottPlatform;
  }

  // Cast (Array of actor names)
  let finalCast: string[] = baseContent.cast || [];
  if (p.cast && tmdbData?.cast && tmdbData.cast.length > 0) {
    finalCast = tmdbData.cast;
  }

  // Genres
  let finalGenreIds: string[] = baseContent.genreIds || [];
  if (p.genres && tmdbData?.genres && tmdbData.genres.length > 0) {
    const matchedGenreIds: string[] = [];
    for (const tmdbG of tmdbData.genres) {
      const match = availableGenres.find(
        (ag) => ag.name.toLowerCase() === tmdbG.name.toLowerCase()
      );
      if (match && !matchedGenreIds.includes(match.id)) {
        matchedGenreIds.push(match.id);
      }
    }
    if (matchedGenreIds.length > 0) {
      finalGenreIds = matchedGenreIds;
    }
  }
  if (finalGenreIds.length === 0 && availableGenres.length > 0) {
    finalGenreIds = [availableGenres[0].id];
  }

  // Languages
  let finalLanguageIds: string[] = baseContent.languageIds || [];
  if (finalLanguageIds.length === 0 && availableLanguages.length > 0) {
    finalLanguageIds = [availableLanguages[0].id];
  }

  // Quality ID
  const qualityId = baseContent.qualityId || (availableQualities.length > 0 ? availableQualities[0].id : '');

  // Seasons / Episodes for series
  let seasonsStr: string | undefined = baseContent.seasons;
  if (finalType === 'series') {
    if (p.seasons && tmdbData?.seasons && tmdbData.seasons.length > 0) {
      seasonsStr = JSON.stringify(tmdbData.seasons);
    } else if (!seasonsStr) {
      seasonsStr = JSON.stringify([]);
    }
  }

  const nowIso = new Date().toISOString();

  const finalContent: Content = {
    id: baseContent.id || Math.random().toString(36).substr(2, 9),
    type: finalType,
    title: finalTitle,
    secondTitle: finalSecondTitle || undefined,
    description: finalDescription,
    posterUrl: finalPosterUrl,
    trailerUrl: finalTrailerUrl,
    genreIds: finalGenreIds,
    languageIds: finalLanguageIds,
    qualityId,
    sampleUrl: baseContent.sampleUrl || undefined,
    imdbLink: finalImdbLink || undefined,
    cast: finalCast,
    year: finalYear,
    releaseDate: finalReleaseDate || undefined,
    runtime: finalRuntime || undefined,
    status: baseContent.status || 'published',
    movieLinks: baseContent.movieLinks || JSON.stringify([]),
    seasons: seasonsStr,
    imdbRating: finalImdbRating || undefined,
    country: finalCountry || undefined,
    ottPlatform: finalOttPlatform,
    order: baseContent.order !== undefined ? baseContent.order : 0,
    createdAt: baseContent.createdAt || nowIso,
    updatedAt: nowIso,
  };

  return finalContent;
}
