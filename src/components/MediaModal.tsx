import React, { useState, useMemo } from 'react';
import { X, Search, Loader2, Film, Save } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { useModalBehavior } from '../hooks/useModalBehavior';

interface MediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialImdbId?: string;
  initialTitle?: string;
  initialYear?: string;
  initialType?: string;
  onApply?: (data: any) => void;
}

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || 'f71c2391161526fa9d19bd0b2759efaf';
const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY || '19daa310';
const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const OMDB_BASE = 'https://www.omdbapi.com/';

export async function searchYouTubeTrailer(title: string, type: string) {
  if (!YOUTUBE_API_KEY) {
     console.warn("YouTube API key is missing. Cannot fallback to YouTube search.");
     return [];
  }
  try {
    const typeLabel = type === 'tv' || type === 'series' ? 'Series' : 'Movie';
    const query = `${title} ${typeLabel} Hindi Trailer`;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}&maxResults=10`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.items) {
      return data.items.map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        thumbnail: item.snippet.thumbnails?.default?.url
      }));
    }
  } catch (e) {
    console.error("YouTube Search Error:", e);
  }
  return [];
}

export async function fetchKinoCheckTrailer(tmdbId: string, type: string) {
  try {
     const endpoint = (type === 'series' || type === 'tv') ? 'shows' : 'movies';
     
     // Priority languages: Hindi, English, Punjabi, Tamil, Telugu, Malayalam, Kannada + Global
     const languages = ['hi', 'en', 'pa', 'ta', 'te', 'ml', 'kn', ''];
     
     const fetchPromises = languages.map(async (lang) => {
       try {
         const langParam = lang ? `&language=${lang}` : '';
         const res = await fetch(`https://api.kinocheck.de/${endpoint}?tmdb_id=${tmdbId}${langParam}`);
         if (res.ok) {
           const data = await res.json();
           if (data.trailer?.youtube_video_id) {
             return { lang, url: `https://www.youtube.com/watch?v=${data.trailer.youtube_video_id}` };
           }
         }
       } catch (e) {}
       return null;
     });

     const results = await Promise.all(fetchPromises);
     
     // Filter out nulls and sort by original priority
     const validResults = results.filter((r): r is { lang: string; url: string } => r !== null);
     
     if (validResults.length === 0) return null;

     // Sort by original languages array order
     validResults.sort((a, b) => {
       const indexA = languages.indexOf(a.lang);
       const indexB = languages.indexOf(b.lang);
       return indexA - indexB;
     });

     return validResults[0].url;
  } catch (e) {
     console.error("KinoCheck Error:", e);
  }
  return null;
}

export async function findTMDBByImdb(imdbID: string, forceType?: string) {
  const url = `${TMDB_BASE}/find/${imdbID}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
  const res = await fetch(url);
  const data = await res.json();
  
  if ((!forceType || forceType === 'movie') && data.movie_results && data.movie_results.length > 0) {
    return { item: data.movie_results[0], type: 'movie' };
  }
  
  if ((!forceType || forceType === 'series' || forceType === 'tv') && data.tv_results && data.tv_results.length > 0) {
    return { item: data.tv_results[0], type: 'tv' };
  }
  
  return null;
}

export async function searchTMDBByTitle(searchTitle: string, searchYear: string, forceType?: string) {
  const results: any[] = [];
  
  // Clean title for URL passing, TMDB often fails if there are hard symbols like dots in strange places
  // We replace symbols with spaces because TMDB searches best with spaced words
  const queryStr = searchTitle.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, ' ').replace(/\s+/g, ' ').trim();
  const finalQuery = encodeURIComponent(queryStr || searchTitle);
  
  if (!forceType || forceType === 'movie' || forceType === 'all') {
    let movieUrl = `${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&query=${finalQuery}`;
    if (searchYear) movieUrl += `&year=${searchYear}`;
    let movieRes = await fetch(movieUrl);
    let movieData = await movieRes.json();
    if (movieData.results) {
      movieData.results.forEach((item: any) => results.push({ item, type: 'movie' }));
    }
  }
  
  if (!forceType || forceType === 'series' || forceType === 'tv' || forceType === 'all') {
    let tvUrl = `${TMDB_BASE}/search/tv?api_key=${TMDB_API_KEY}&query=${finalQuery}`;
    if (searchYear) tvUrl += `&first_air_date_year=${searchYear}`;
    let tvRes = await fetch(tvUrl);
    let tvData = await tvRes.json();
    if (tvData.results) {
      tvData.results.forEach((item: any) => results.push({ item, type: 'tv' }));
    }
  }
  
  return results;
}

export async function fetchTMDBDetails(tmdbId: string, type: string) {
  const url = `${TMDB_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits,external_ids,content_ratings,videos&include_video_language=hi,en,es,fr,de,it,pt,ru,zh,ja,ko,null`;
  const res = await fetch(url);
  return await res.json();
}

export async function fetchSeriesSeasons(tmdbId: string, knownSeasons?: any[]) {
  let seasonsDataList = knownSeasons;
  if (!seasonsDataList) {
    const url = `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.seasons) return [];
    seasonsDataList = data.seasons;
  }

  const validSeasons = seasonsDataList.filter((s: any) => s.season_number !== 0);
  const seasonPromises = validSeasons.map(async (season: any) => {
    const seasonUrl = `${TMDB_BASE}/tv/${tmdbId}/season/${season.season_number}?api_key=${TMDB_API_KEY}&append_to_response=videos&include_video_language=hi,en,es,fr,de,it,pt,ru,zh,ja,ko,null`;
    const seasonRes = await fetch(seasonUrl);
    const seasonData = await seasonRes.json();
    return {
      season: season.season_number,
      name: season.name,
      year: season.air_date ? season.air_date.split('-')[0] : 'N/A',
      trailerUrl: getBestTrailer(seasonData.videos) || '',
      episodes: seasonData.episodes || []
    };
  });

  const seasons = await Promise.all(seasonPromises);
  return seasons.sort((a, b) => a.season - b.season);
}

export function getBestTrailer(videos: { results?: any[] }) {
  if (!videos || !Array.isArray(videos.results)) return null;
  const youtubeVideos = videos.results.filter(v => v.site === 'YouTube');
  if (youtubeVideos.length === 0) return null;

  // Language priority: Hindi then English
  const hindiVideos = youtubeVideos.filter(v => v.iso_639_1 === 'hi');
  const englishVideos = youtubeVideos.filter(v => v.iso_639_1 === 'en');
  
  const searchInSet = (set: any[]) => {
    // 1. Official Trailer
    let best = set.find(v => v.type === 'Trailer' && v.official);
    if (best) return best;
    // 2. Any Trailer
    best = set.find(v => v.type === 'Trailer');
    if (best) return best;
    // 3. Official Teaser
    best = set.find(v => v.type === 'Teaser' && v.official);
    if (best) return best;
    // 4. Any Teaser
    best = set.find(v => v.type === 'Teaser');
    if (best) return best;
    // 5. Clip/Other
    best = set.find(v => v.type === 'Clip' || v.type === 'Featurette');
    return best || null;
  };

  const bestHindi = searchInSet(hindiVideos);
  if (bestHindi) return `https://www.youtube.com/watch?v=${bestHindi.key}`;

  const bestEnglish = searchInSet(englishVideos);
  if (bestEnglish) return `https://www.youtube.com/watch?v=${bestEnglish.key}`;

  const bestOther = searchInSet(youtubeVideos);
  return bestOther ? `https://www.youtube.com/watch?v=${bestOther.key}` : null;
}

export async function fetchIMDbRating(imdbID: string) {
  if (!imdbID) return null;
  const url = `${OMDB_BASE}?i=${imdbID}&apikey=${OMDB_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.Response === 'True') {
    return {
      rating: data.imdbRating,
      votes: data.imdbVotes,
    };
  }
  return null;
}

export const MediaModal: React.FC<MediaModalProps> = ({ isOpen, onClose, initialImdbId = '', initialTitle = '', initialYear = '', initialType = '', onApply }) => {
  const [imdbId, setImdbId] = useState(initialImdbId);
  const [title, setTitle] = useState(initialTitle);
  const [year, setYear] = useState(initialYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trailerSource, setTrailerSource] = useState<'kinocheck' | 'tmdb' | 'youtube' | null>(null);
  const [fetchedData, setFetchedData] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [youtubeTrailerOptions, setYoutubeTrailerOptions] = useState<any[] | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'tv'>(() => {
    if (initialType === 'movie') return 'movie';
    if (initialType === 'series' || initialType === 'tv') return 'tv';
    return 'all';
  });
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('mediaModal_selectedFields');
    return saved ? JSON.parse(saved) : {};
  });
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>(() => {
    const saved = localStorage.getItem('mediaModal_selectedSeasons');
    return saved ? JSON.parse(saved) : [];
  });
  const [includeEpisodeDescriptions, setIncludeEpisodeDescriptions] = useState(() => {
    const saved = localStorage.getItem('mediaModal_includeEpisodeDescriptions');
    return saved ? JSON.parse(saved) : true;
  });

  useModalBehavior(isOpen, onClose);

  React.useEffect(() => {
    localStorage.setItem('mediaModal_includeEpisodeDescriptions', JSON.stringify(includeEpisodeDescriptions));
  }, [includeEpisodeDescriptions]);

  React.useEffect(() => {
    if (Object.keys(selectedFields).length > 0) {
      localStorage.setItem('mediaModal_selectedFields', JSON.stringify(selectedFields));
    }
  }, [selectedFields]);

  React.useEffect(() => {
    if (selectedSeasons.length > 0) {
      localStorage.setItem('mediaModal_selectedSeasons', JSON.stringify(selectedSeasons));
    }
  }, [selectedSeasons]);

  React.useEffect(() => {
    if (isOpen) {
      setImdbId(initialImdbId);
      setTitle(initialTitle);
      setYear(initialYear);
      setFetchedData(null);
      setSearchResults(null);
      
      const defaultFilter = initialType === 'movie' ? 'movie' : (initialType === 'series' || initialType === 'tv' ? 'tv' : 'all');
      setFilterType(defaultFilter);
      setTrailerSource(null);
      setError(null);
      
      if (initialImdbId || initialTitle) {
        handleFetchWithParams(initialImdbId, initialTitle, initialYear, initialType);
      }
    }
  }, [isOpen, initialImdbId, initialTitle, initialYear]);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  async function findTMDBByImdb(imdbID: string, forceType?: string) {
    const url = `${TMDB_BASE}/find/${imdbID}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    const res = await fetch(url);
    const data = await res.json();
    
    if ((!forceType || forceType === 'movie') && data.movie_results && data.movie_results.length > 0) {
      return { item: data.movie_results[0], type: 'movie' };
    }
    
    if ((!forceType || forceType === 'series' || forceType === 'tv') && data.tv_results && data.tv_results.length > 0) {
      return { item: data.tv_results[0], type: 'tv' };
    }
    
    return null;
  }

  const handleFetchWithParams = async (searchImdbId: string, searchTitle: string, searchYear: string, searchForceType?: string) => {
    setLoading(true);
    setError(null);
    setFetchedData(null);
    setSearchResults(null);
    
    // Set filterType based on searchForceType if provided
    const initialFilter = searchForceType === 'movie' ? 'movie' : (searchForceType === 'series' || searchForceType === 'tv' ? 'tv' : 'all');
    setFilterType(initialFilter);

    const performTitleSearch = async (t: string, y: string, ft?: string) => {
      let res = await searchTMDBByTitle(t.trim(), y.trim(), ft);
      if ((!res || res.length === 0) && y.trim()) {
        res = await searchTMDBByTitle(t.trim(), '', ft);
      }
      return res;
    };

    try {
      if (searchImdbId.trim()) {
        const idStr = searchImdbId.trim();
        const isNumeric = /^\d+$/.test(idStr);
        
        if (isNumeric) {
          // If searching by TMDB ID, we should still respect the type if provided
          if (!searchForceType || searchForceType === 'movie' || searchForceType === 'all') {
            try {
              const movieRes = await fetch(`${TMDB_BASE}/movie/${idStr}?api_key=${TMDB_API_KEY}`);
              if (movieRes.ok) {
                await fetchFullDetails(idStr, 'movie');
                return;
              }
            } catch (e) {}
          }
          
          if (!searchForceType || searchForceType === 'series' || searchForceType === 'tv' || searchForceType === 'all') {
            try {
              const tvRes = await fetch(`${TMDB_BASE}/tv/${idStr}?api_key=${TMDB_API_KEY}`);
              if (tvRes.ok) {
                await fetchFullDetails(idStr, 'tv');
                return;
              }
            } catch (e) {}
          }
          
          // If not found by TMDB ID, fall back to title search if title is provided
          if (searchTitle.trim()) {
            const results = await performTitleSearch(searchTitle, searchYear, searchForceType);
            if (results && results.length > 1) {
              setSearchResults(results);
              return;
            } else if (results && results.length === 1) {
              await fetchFullDetails(results[0].item.id, results[0].type);
              return;
            }
          }
          throw new Error(`No TMDB entry found for ID: ${idStr}`);
        } else {
          const match = idStr.match(/tt\d+/);
          const imdbID = match ? match[0] : idStr;
          const found = await findTMDBByImdb(imdbID, searchForceType);
          if (found) {
            await fetchFullDetails(found.item.id, found.type);
            return;
          } else {
            // If not found by IMDb ID, fall back to title search if title is provided
            if (searchTitle.trim()) {
              const results = await performTitleSearch(searchTitle, searchYear, searchForceType);
              if (results && results.length > 1) {
                setSearchResults(results);
                return;
              } else if (results && results.length === 1) {
                await fetchFullDetails(results[0].item.id, results[0].type);
                return;
              }
            }
            throw new Error(`No TMDB entry found for IMDb ID: ${imdbID}`);
          }
        }
      } else if (searchTitle.trim()) {
        const results = await performTitleSearch(searchTitle, searchYear, searchForceType);
        if (results && results.length > 1) {
          setSearchResults(results);
        } else if (results && results.length === 1) {
          await fetchFullDetails(results[0].item.id, results[0].type);
        } else {
          throw new Error('No movie or series found with that title/year.');
        }
      } else {
        throw new Error('Please provide either an ID or a title.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const sortedAndFilteredResults = useMemo(() => {
    if (!searchResults) return [];
    let results = [...searchResults];
    
    if (filterType !== 'all') {
      results = results.filter(r => r.type === filterType);
    }
    
    return results.sort((a, b) => {
      const normalizeStr = (str: string) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const searchTitleNorm = normalizeStr(title);
      
      const titleA = normalizeStr(a.item.title || a.item.name || a.item.original_title || a.item.original_name);
      const titleB = normalizeStr(b.item.title || b.item.name || b.item.original_title || b.item.original_name);
      
      const isExactA = titleA === searchTitleNorm ? 1 : 0;
      const isExactB = titleB === searchTitleNorm ? 1 : 0;
      
      const targetYear = parseInt(year);
      const yearA = parseInt((a.item.release_date || a.item.first_air_date || '0').split('-')[0]) || 0;
      const yearB = parseInt((b.item.release_date || b.item.first_air_date || '0').split('-')[0]) || 0;

      const isNearYearA = !isNaN(targetYear) && Math.abs(yearA - targetYear) <= 3 ? 1 : 0;
      const isNearYearB = !isNaN(targetYear) && Math.abs(yearB - targetYear) <= 3 ? 1 : 0;

      const scoreA = (isExactA * 10) + isNearYearA;
      const scoreB = (isExactB * 10) + isNearYearB;

      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      return yearB - yearA;
    });
  }, [searchResults, filterType, title, year]);

  const fetchFullDetails = async (tmdbId: string, type: string) => {
    setLoading(true);
    setSearchResults(null);
    setYoutubeTrailerOptions(null);
    try {
      const details = await fetchTMDBDetails(tmdbId, type);
      
      const promises: Promise<any>[] = [];
      let imdbPromiseIndex = -1;
      let seasonsPromiseIndex = -1;
      let kinocheckPromiseIndex = -1;

      if (details.external_ids && details.external_ids.imdb_id) {
        promises.push(fetchIMDbRating(details.external_ids.imdb_id));
        imdbPromiseIndex = promises.length - 1;
      }

      if (type === 'tv') {
        promises.push(fetchSeriesSeasons(tmdbId, details.seasons));
        seasonsPromiseIndex = promises.length - 1;
      }

      promises.push(fetchKinoCheckTrailer(tmdbId, type));
      kinocheckPromiseIndex = promises.length - 1;

      const results = await Promise.all(promises);

      const imdbRatingData = imdbPromiseIndex !== -1 ? results[imdbPromiseIndex] : null;
      const seasonsData = seasonsPromiseIndex !== -1 ? results[seasonsPromiseIndex] : null;
      let trailerUrl = getBestTrailer(details.videos) || '';
      
      if (trailerUrl) {
          setTrailerSource('tmdb');
      } else {
          trailerUrl = kinocheckPromiseIndex !== -1 ? results[kinocheckPromiseIndex] : null;
          if (trailerUrl) setTrailerSource('kinocheck');
      }

      const parsedData: any = {
        title: details.title || details.name,
        type: type === 'tv' ? 'series' : 'movie',
        description: details.overview,
        year: (details.release_date || details.first_air_date || '').split('-')[0],
        releaseDate: details.release_date || details.first_air_date,
        posterUrl: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : '',
        runtime: details.runtime ? `${details.runtime} min` : (details.episode_run_time && details.episode_run_time.length > 0 ? `${details.episode_run_time[0]} min/episode` : ''),
        country: details.production_countries?.map((c: any) => c.name).join(', ') || (details.origin_country ? details.origin_country.join(', ') : ''),
        cast: details.credits?.cast?.slice(0, 5).map((a: any) => a.name).join(', ') || '',
        imdbLink: details.external_ids?.imdb_id ? `https://www.imdb.com/title/${details.external_ids.imdb_id}` : '',
        imdbRating: imdbRatingData?.rating && imdbRatingData.rating !== 'N/A' ? `${imdbRatingData.rating}/10` : '',
        genres: details.genres?.map((g: any) => g.name) || [],
        trailerUrl,
        seasons: seasonsData
      };

      setFetchedData(parsedData);

      // Search YouTube if TMDB didn't provide a trailer
      if (!parsedData.trailerUrl) {
         setLoading(true);
         const ytResults = await searchYouTubeTrailer(parsedData.title || details.name, type);
         if (ytResults && ytResults.length > 0) {
             // Sort by priority: Official Trailer > Trailer > Teaser > Clip
             ytResults.sort((a: any, b: any) => {
                 const tA = a.title.toLowerCase();
                 const tB = b.title.toLowerCase();
                 const p = (t: string) => {
                     if (t.includes('official') && t.includes('trailer')) return 1;
                     if (t.includes('trailer')) return 2;
                     if (t.includes('teaser')) return 3;
                     if (t.includes('clip')) return 4;
                     return 5;
                 };
                 return p(tA) - p(tB);
             });
             setYoutubeTrailerOptions(ytResults);
         }
         setLoading(false);
      } else {
        // Fetch YouTube title if trailerUrl exists
        try {
          const res = await fetch(`https://www.youtube.com/oembed?url=${parsedData.trailerUrl}&format=json`);
          if (res.ok) {
            const ytData = await res.json();
            if (ytData.title) {
              setFetchedData((prev: any) => prev ? { ...prev, trailerTitle: ytData.title } : null);
            }
          }
        } catch (e) {
          console.error("Error fetching YouTube title in modal:", e);
        }
      }
      
      // Select all fields by default if not already set
      const allFields: Record<string, boolean> = {};
      Object.keys(parsedData).forEach(k => {
        if (k !== 'seasons' && parsedData[k] && (Array.isArray(parsedData[k]) ? parsedData[k].length > 0 : true)) {
          allFields[k] = true;
        }
      });
      
      setSelectedFields(prev => {
        if (Object.keys(prev).length === 0) return allFields;
        return prev;
      });
      
      if (seasonsData) {
        setSelectedSeasons(prev => {
          if (prev.length === 0) return seasonsData.map((s: any) => s.season);
          return prev;
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!fetchedData || !onApply) return;
    
    const dataToApply: any = {};
    Object.keys(selectedFields).forEach(key => {
      if (selectedFields[key]) {
        dataToApply[key] = fetchedData[key];
      }
    });

    if (fetchedData.seasons && selectedSeasons.length > 0) {
      dataToApply.seasons = fetchedData.seasons.filter((s: any) => selectedSeasons.includes(s.season)).map((s: any) => ({
        id: `s${s.season}`,
        seasonNumber: s.season,
        title: s.name && !/^Season\s+\d+$/i.test(s.name) ? s.name : '',
        year: s.year && s.year !== 'N/A' ? parseInt(s.year.toString()) : undefined,
        seasonYear: s.year && s.year !== 'N/A' ? parseInt(s.year.toString()) : undefined,
        trailerUrl: s.trailerUrl || '',
        episodes: s.episodes.map((e: any) => ({
          id: `e${e.episode_number}`,
          episodeNumber: e.episode_number,
          title: e.name,
          description: includeEpisodeDescriptions ? (e.overview || '') : '',
          duration: e.runtime ? `${e.runtime}m` : '',
          videoUrl: ''
        }))
      }));

      // Map season trailers to the main trailers array if they exist
      const seasonTrailers = fetchedData.seasons
        .filter((s: any) => selectedSeasons.includes(s.season) && s.trailerUrl)
        .map((s: any) => {
          let trailerTitle = s.name || '';
          // If title is just "Season X", make it empty per user request
          if (/^Season\s+\d+$/i.test(trailerTitle.trim())) {
            trailerTitle = '';
          }
          
          return {
            id: `season-trailer-${s.season}`,
            url: s.trailerUrl,
            title: trailerTitle,
            seasonNumber: s.season
          };
        });
      
      if (seasonTrailers.length > 0) {
        dataToApply.trailers = seasonTrailers;
      }
    }

    onApply(dataToApply);
    onClose();
  };

  const toggleField = (field: string) => {
    setSelectedFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
        >
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl transition-colors duration-300">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800 transition-colors duration-300">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Master Fetch</h2>
          <button onClick={onClose} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all active:scale-95"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 transition-colors duration-300">
          <div className="flex flex-wrap gap-3 items-center">
            <input type="text" value={imdbId} onChange={e => setImdbId(e.target.value)} placeholder="TMDB ID or IMDb ID (e.g., tt21842982)" className="flex-1 min-w-[140px] p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors duration-300" />
            <span className="text-zinc-500 font-medium text-sm">OR</span>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Movie/Series title" className="flex-1 min-w-[140px] p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors duration-300" />
            <input type="text" value={year} onChange={e => setYear(e.target.value)} placeholder="Year" className="w-24 p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors duration-300" />
            <div className="flex gap-2">
              <button 
                onClick={() => handleFetchWithParams(imdbId, title, year, filterType === 'all' ? undefined : filterType)} 
                disabled={loading}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50 transition-all active:scale-95 border border-white/20 shadow-lg"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Fetch
              </button>

              {fetchedData && onApply && (
                <button 
                  onClick={handleApply}
                  className="bg-cyan-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-cyan-700 flex items-center gap-2 transition-all active:scale-95 border border-white/20 shadow-lg"
                >
                  <Save className="w-4 h-4" />
                  Apply
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-lg mb-4">
              {error}
            </div>
          )}

          {!fetchedData && !loading && !error && (
            <div className="text-center text-zinc-500 py-10">
              Enter an IMDb ID or Title + Year to fetch data.
            </div>
          )}

          {searchResults && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider truncate">Search Results ({sortedAndFilteredResults.length})</h3>
                <div className="flex gap-1 shrink-0">
                  {(['all', 'movie', 'tv'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                        filterType === t 
                          ? 'bg-emerald-500 text-white' 
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {t === 'tv' ? 'Series' : t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {sortedAndFilteredResults.map((res, idx) => (
                  <button
                    key={`${res.item.id}-${idx}`}
                    onClick={() => fetchFullDetails(res.item.id, res.type)}
                    className="flex items-center gap-4 p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-emerald-500/50 transition-all text-left group"
                  >
                    <div className="w-12 h-18 bg-zinc-200 dark:bg-zinc-700 rounded overflow-hidden shrink-0">
                      {res.item.poster_path ? (
                        <img src={`https://image.tmdb.org/t/p/w92${res.item.poster_path}`} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 dark:text-zinc-500">
                          <Film className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-zinc-900 dark:text-white group-hover:text-emerald-500 transition-colors truncate">
                        {res.item.title || res.item.name}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2 mt-1">
                        <span className={clsx(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold text-white",
                          res.type === 'movie' ? 'bg-blue-500/90' : 'bg-purple-500/90'
                        )}>
                          {res.type === 'movie' ? 'Movie' : 'Series'}
                        </span>
                        <span>{(res.item.release_date || res.item.first_air_date || '').split('-')[0]}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {youtubeTrailerOptions && (
            <div className="bg-zinc-100 dark:bg-zinc-800/80 p-4 rounded-xl space-y-3">
              <div className="text-sm font-bold text-zinc-900 dark:text-white">Trailer not found in TMDB. Select a YouTube Match:</div>
              <div className="grid grid-cols-1 gap-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                {youtubeTrailerOptions.map((yt: any) => (
                  <button
                    key={yt.id}
                    onClick={() => {
                       setFetchedData((prev: any) => ({ ...prev, trailerUrl: yt.url, trailerTitle: yt.title }));
                       setSelectedFields(prev => ({ ...prev, trailerUrl: true }));
                       setYoutubeTrailerOptions(null);
                    }}
                    className="flex items-center gap-3 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 p-2 text-left rounded-lg transition-colors border border-zinc-200 dark:border-zinc-700/50"
                  >
                    <img src={yt.thumbnail} alt="" className="w-16 h-12 object-cover rounded shadow-sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{yt.title}</div>
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">youtube.com/watch?v={yt.id}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {fetchedData && (
            <div className="space-y-6">
              <div className="flex gap-6">
                {fetchedData.posterUrl && (
                  <div className="w-32 shrink-0">
                    <img src={fetchedData.posterUrl} alt="Poster" className="w-full rounded-lg shadow-lg" />
                    <label className="flex items-center gap-2 mt-2 text-sm text-zinc-600 dark:text-zinc-300 cursor-pointer">
                      <input type="checkbox" checked={!!selectedFields.posterUrl} onChange={() => toggleField('posterUrl')} className="rounded bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-emerald-500 focus:ring-emerald-500" />
                      Include Poster
                    </label>
                  </div>
                )}
                <div className="flex-1 space-y-4">
                  {[
                    { key: 'title', label: 'Title', value: fetchedData.title },
                    { key: 'type', label: 'Type', value: fetchedData.type },
                    { key: 'year', label: 'Year', value: fetchedData.year },
                    { key: 'releaseDate', label: 'Release Date', value: fetchedData.releaseDate },
                    { key: 'country', label: 'Country', value: fetchedData.country },
                    { key: 'runtime', label: 'Runtime', value: fetchedData.runtime },
                    { key: 'imdbRating', label: 'IMDb Rating', value: fetchedData.imdbRating },
                    { key: 'imdbLink', label: 'IMDb Link', value: fetchedData.imdbLink },
                    { key: 'trailerUrl', label: 'Trailer URL', value: fetchedData.trailerUrl },
                  ].map(field => field.value ? (
                    <div key={field.key} className="flex items-start gap-3">
                      <input 
                        type="checkbox" 
                        checked={!!selectedFields[field.key]} 
                        onChange={() => toggleField(field.key)}
                        className="mt-1 rounded bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-zinc-500 dark:text-zinc-500 font-medium uppercase">{field.label}</div>
                          {field.key === 'trailerUrl' && trailerSource && (
                            <span className={clsx(
                              "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                              trailerSource === 'kinocheck' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : 
                              trailerSource === 'tmdb' ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" :
                              "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                            )}>
                              {trailerSource === 'kinocheck' ? 'By KinoCheck' : 
                               trailerSource === 'tmdb' ? 'By TMDB' : 'By YouTube'}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-zinc-900 dark:text-white break-all">{field.value}</div>
                        {field.key === 'trailerUrl' && fetchedData.trailerTitle && (
                          <div className="text-xs text-emerald-500 mt-1 font-medium">
                            Title: {fetchedData.trailerTitle}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null)}
                </div>
              </div>

              {fetchedData.description && (
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    checked={!!selectedFields.description} 
                    onChange={() => toggleField('description')}
                    className="mt-1 rounded bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-500 font-medium uppercase">Synopsis</div>
                    <div className="text-sm text-zinc-700 dark:text-zinc-300">{fetchedData.description}</div>
                  </div>
                </div>
              )}

              {fetchedData.cast && fetchedData.cast.length > 0 && (
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    checked={!!selectedFields.cast} 
                    onChange={() => toggleField('cast')}
                    className="mt-1 rounded bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-500 font-medium uppercase">Cast</div>
                    <div className="text-sm text-zinc-700 dark:text-zinc-300">{fetchedData.cast}</div>
                  </div>
                </div>
              )}

              {fetchedData.genres && fetchedData.genres.length > 0 && (
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    checked={!!selectedFields.genres} 
                    onChange={() => toggleField('genres')}
                    className="mt-1 rounded bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-500 font-medium uppercase">Genres</div>
                    <div className="text-sm text-zinc-700 dark:text-zinc-300">{fetchedData.genres.join(', ')}</div>
                  </div>
                </div>
              )}

              {fetchedData.seasons && fetchedData.seasons.length > 0 && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-4 transition-colors duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-zinc-900 dark:text-white">Select Seasons:</h4>
                    <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-600 dark:text-zinc-300 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={includeEpisodeDescriptions}
                        onChange={(e) => setIncludeEpisodeDescriptions(e.target.checked)}
                        className="rounded bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-emerald-500 focus:ring-emerald-500"
                      />
                      Include Episode Descriptions
                    </label>
                  </div>
                  <div className="space-y-3">
                    {fetchedData.seasons.map((s: any) => (
                      <div key={s.season} className="border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden bg-zinc-50/30 dark:bg-zinc-950/30 transition-colors duration-300">
                        <label className="flex items-center gap-3 p-4 cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 transition-colors">
                          <input 
                            type="checkbox" 
                            checked={selectedSeasons.includes(s.season)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedSeasons([...selectedSeasons, s.season]);
                              else setSelectedSeasons(selectedSeasons.filter(sn => sn !== s.season));
                            }}
                            className="rounded bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600 text-emerald-500 focus:ring-emerald-500"
                          />
                          <div className="font-medium text-zinc-900 dark:text-white">Season {s.season}</div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-500 ml-auto">
                            {s.year !== 'N/A' ? `${s.year} • ` : ''}
                            {s.episodes?.length || 0} Episodes
                          </div>
                        </label>
                        
                        {selectedSeasons.includes(s.season) && s.episodes && (
                          <div className="px-4 pb-4 pt-1 border-t border-zinc-100 dark:border-zinc-800/50 transition-colors duration-300">
                            <div className="max-h-48 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                              {s.episodes.map((ep: any) => (
                                <div key={ep.episode_number} className="text-sm flex gap-3 p-2 rounded-lg bg-zinc-100/50 dark:bg-zinc-900/50 transition-colors duration-300">
                                  <div className="text-zinc-500 dark:text-zinc-400 dark:text-zinc-500 font-mono w-6 shrink-0">{ep.episode_number}.</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-zinc-800 dark:text-zinc-200 font-medium truncate">{ep.name}</div>
                                    {ep.overview && <div className="text-xs text-zinc-500 dark:text-zinc-500 line-clamp-1 mt-0.5">{ep.overview}</div>}
                                  </div>
                                  {ep.runtime && <div className="text-xs text-zinc-500 dark:text-zinc-400 dark:text-zinc-600 shrink-0">{ep.runtime}m</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )}
</AnimatePresence>
  );
};
