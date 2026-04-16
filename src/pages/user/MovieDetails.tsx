import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate, useLocation, useNavigationType } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { Content, QualityLinks, Season, Trailer } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useContent } from '../../contexts/ContentContext';
import { useCart } from '../../contexts/CartContext';
import { Film, ArrowLeft, Play, Clock, Heart, MessageCircle, AlertCircle, Download, Share2, Chrome, Copy, Youtube, X, Edit2, Trash2, Settings, Lock, ChevronDown, ChevronUp, Loader2, Search, AlertTriangle, Globe, ShoppingCart, RefreshCw } from 'lucide-react';
import { logEvent } from '../../services/analytics';
import AlertModal from '../../components/AlertModal';
import ConfirmModal from '../../components/ConfirmModal';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { formatContentTitle, formatReleaseDate, formatRuntime, getContrastColor } from '../../utils/contentUtils';
import { generateTinyUrl } from '../../utils/tinyurl';
import { MediaModal } from '../../components/MediaModal';
import ContentCard from '../../components/ContentCard';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import { useSettings } from '../../contexts/SettingsContext';

export default function MovieDetails() {
  const { id } = useParams<{ id: string }>();
  const { profile, loading: profileLoading, toggleFavorite: authToggleFavorite, toggleWatchLater: authToggleWatchLater } = useAuth();
  const { contentList, genres, languages, qualities, loading: contentLoading, isOffline } = useContent();
  const { cart, addToCart } = useCart();
  const { settings } = useSettings();
  const content = useMemo(() => {
    console.log('DEBUG: id=', id, 'contentList length=', contentList.length);
    if (contentList.length > 0) {
      console.log('DEBUG: First content id=', contentList[0].id);
    }
    const found = contentList.find(c => c.id === id) || null;
    if (!found) {
      console.log('DEBUG: Content NOT found for id=', id);
      console.log('DEBUG: contentList=', contentList);
    } else {
      console.log('DEBUG: Content found=', found);
    }
    return found;
  }, [contentList, id]);
  
  const [loading, setLoading] = useState(true);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    console.log('DEBUG: contentList changed, length=', contentList.length);
  }, [contentList]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isWatchLaterLoading, setIsWatchLaterLoading] = useState(false);
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [linkPopup, setLinkPopup] = useState<{ isOpen: boolean; url: string; name: string; id: string; isZip?: boolean; tinyUrl?: string } | null>(null);
  const [isPosterExpanded, setIsPosterExpanded] = useState(false);
  const [isTrailerPopupOpen, setIsTrailerPopupOpen] = useState(false);
  const [isTrailerSelectionOpen, setIsTrailerSelectionOpen] = useState(false);
  const [activeTrailerUrl, setActiveTrailerUrl] = useState<string | null>(null);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [lockedContentInfo, setLockedContentInfo] = useState<{ 
    id: string; 
    type: 'movie' | 'season'; 
    seasonId?: string; 
    seasonNumber?: number; 
    title: string;
    price: number;
  } | null>(null);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<string, boolean>>({});
  const [cachedMetadata, setCachedMetadata] = useState<{id: string, data: Partial<Content>}>(() => ({ id: '', data: {} }));

  const [isReporting, setIsReporting] = useState(false);
  const [liveRating, setLiveRating] = useState<string | null>(null);
  const [fetchingImdb, setFetchingImdb] = useState(false);

  useModalBehavior(alertConfig.isOpen, () => setAlertConfig(prev => ({ ...prev, isOpen: false })));
  useModalBehavior(showLoginPrompt, () => setShowLoginPrompt(false));
  useModalBehavior(isTrailerPopupOpen, () => { setIsTrailerPopupOpen(false); setActiveTrailerUrl(null); });
  useModalBehavior(isTrailerSelectionOpen, () => setIsTrailerSelectionOpen(false));
  useModalBehavior(linkPopup?.isOpen || false, () => setLinkPopup(null));
  useModalBehavior(!!deleteId, () => setDeleteId(null));
  useModalBehavior(isMediaModalOpen, () => setIsMediaModalOpen(false));
  useModalBehavior(isPosterExpanded, () => setIsPosterExpanded(false));

  const hasLoggedView = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();

  // Scroll to top on mount or ID change, but only if it's a new navigation (PUSH/REPLACE)
  // If it's a POP navigation (back button), we want to preserve the scroll position
  useEffect(() => {
    if (navigationType !== 'POP') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [id, navigationType]);

  const [fullContent, setFullContent] = useState<Content | null>(() => {
    if (id) {
      const cached = localStorage.getItem(`movie_details_${id}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.id === id) return parsed;
        } catch (e) {}
      }
    }
    return null;
  });
  const [fetchFailed, setFetchFailed] = useState(false);
  const hasFetchedFull = useRef<Record<string, boolean>>({});

  // Reset state and load cache on ID change
  useEffect(() => {
    if (id) {
      // Load full content cache
      const cachedFull = localStorage.getItem(`movie_details_${id}`);
      if (cachedFull) {
        try {
          const parsed = JSON.parse(cachedFull);
          if (parsed.id === id) {
            setFullContent(parsed);
          } else {
            setFullContent(null);
          }
        } catch (e) {
          setFullContent(null);
        }
      } else {
        setFullContent(null);
      }

      // Load metadata cache
      const cachedMeta = localStorage.getItem(`content_cache_${id}`);
      if (cachedMeta) {
        try {
          setCachedMetadata({ id: id || '', data: JSON.parse(cachedMeta) });
        } catch (e) {
          setCachedMetadata({ id: id || '', data: {} });
        }
      } else {
        setCachedMetadata({ id: id || '', data: {} });
      }
    } else {
      setFullContent(null);
      setCachedMetadata({ id: '', data: {} });
    }
    setLiveRating(null);
    setFetchFailed(false);
    setFetchingImdb(false);
    hasLoggedView.current = false;
    hasAttemptedRatingFetch.current = {};
    hasAttemptedStaticFetch.current = {};
  }, [id]);

  const [recentlyViewed, setRecentlyViewed] = useState<Content[]>([]);

  useEffect(() => {
    try {
      const recentStr = localStorage.getItem('recently_viewed');
      if (recentStr) {
        setRecentlyViewed(JSON.parse(recentStr));
      }
    } catch (e) {
      console.error("Failed to load recently viewed", e);
    }
  }, []);

  const isMinimal = useMemo(() => {
    if (!content) return true;
    let parsedSeasons: any[] = [];
    try {
      parsedSeasons = content.type === 'series' && content.seasons ? (Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons as string)) : [];
    } catch (e) {}
    
    const hasFullSeasons = content.type === 'series' && 
      parsedSeasons.length > 0 && 
      parsedSeasons.some((s: any) => s.episodes && s.episodes.length > 1);

    return (content.type === 'movie' && !content.movieLinks) || 
           (content.type === 'series' && !hasFullSeasons);
  }, [content]);

  useEffect(() => {
    if (isMinimal && id && !fetchFailed && !isOffline && !hasFetchedFull.current[id]) {
      hasFetchedFull.current[id] = true;
      const fetchFullContent = async () => {
        try {
          const docRef = doc(db, 'content', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = { id: docSnap.id, ...docSnap.data() } as Content;
            setFullContent(data);
            localStorage.setItem(`movie_details_${id}`, JSON.stringify(data));
          } else {
            setFetchFailed(true);
          }
        } catch (e) {
          console.error("Failed to fetch full content", e);
          setFetchFailed(true);
        }
      };
      fetchFullContent();
    }
  }, [isMinimal, id, fetchFailed, isOffline]);

  const mergedContent = useMemo(() => {
    if (!content && !fullContent) return null;
    // Prioritize cachedMetadata (TMDB updates/local edits), then fresh fullContent from DB, then partial content from list
    const metadata = cachedMetadata.id === id ? cachedMetadata.data : {};
    const validFullContent = fullContent?.id === id ? fullContent : {};
    return {
      ...(content || {}),
      ...validFullContent,
      ...metadata
    } as Content;
  }, [content, cachedMetadata, fullContent, id]);

  const seasons = useMemo(() => {
    if (!mergedContent || mergedContent.type !== 'series' || !mergedContent.seasons) return [] as Season[];
    try {
      const sData = mergedContent.seasons;
      return (Array.isArray(sData) ? sData : JSON.parse(sData || '[]')) as Season[];
    } catch (e) {
      console.error("Error parsing seasons:", e);
      return [] as Season[];
    }
  }, [mergedContent]);

  const allTrailers = useMemo(() => {
    const list: Trailer[] = [];
    if (mergedContent?.trailerUrl) {
      list.push({ 
        id: 'main', 
        url: mergedContent.trailerUrl, 
        title: mergedContent.trailerTitle || '', 
        youtubeTitle: mergedContent.trailerYoutubeTitle,
        seasonNumber: mergedContent.trailerSeasonNumber 
      });
    }
    if (mergedContent?.trailers) {
      try {
        const additional = (Array.isArray(mergedContent.trailers) ? mergedContent.trailers : JSON.parse(mergedContent.trailers || '[]')) as Trailer[];
        list.push(...additional);
      } catch (e) {}
    }
    // Also include season trailers if not already in the list
    seasons.forEach(s => {
      if (s.trailerUrl && !list.some(t => t.url === s.trailerUrl)) {
        list.push({ id: `season-${s.seasonNumber}`, url: s.trailerUrl, title: '', seasonNumber: s.seasonNumber });
      }
    });
    return list;
  }, [mergedContent, seasons]);

  const title = mergedContent ? `${formatContentTitle(mergedContent)} (${mergedContent.year}) - ${settings?.headerText || 'MovizNow'}` : (settings?.headerText || 'MovizNow');
  const description = mergedContent?.description || `Watch the latest movies and series on ${settings?.headerText || 'MovizNow'}.`;
  const imageUrl = mergedContent?.posterUrl || settings?.defaultAppImage || 'https://Moviz-Now.vercel.app/logo.svg';
  const pageUrl = window.location.href;

  const displayData = useMemo(() => {
    if (!mergedContent) return null;
    
    // Helper to handle cast which could be string or array
    const getCastArray = () => {
      const cast = mergedContent.cast as any;
      if (Array.isArray(cast)) return cast;
      if (typeof cast === 'string') return cast.split(',').map(s => s.trim()).filter(Boolean);
      return [];
    };

    const castArray = getCastArray();

    const getGenresString = () => {
      // 1. Try to map genreIds to names
      if (mergedContent.genreIds && Array.isArray(mergedContent.genreIds)) {
        const names = genres.filter(g => mergedContent.genreIds?.includes(g.id)).map(g => g.name);
        if (names.length > 0) return names.join(', ');
      }
      // 2. Fallback to genres property if it's an array of names
      if ((mergedContent as any).genres && Array.isArray((mergedContent as any).genres)) {
        return (mergedContent as any).genres.join(', ');
      }
      return '';
    };

    return {
      title: mergedContent.title,
      year: mergedContent.year,
      description: mergedContent.description,
      cast: castArray.join(', '),
      castArray: castArray,
      posterUrl: mergedContent.posterUrl,
      genres: getGenresString(),
      releaseDate: mergedContent.releaseDate,
      duration: mergedContent.runtime,
      country: mergedContent.country,
      type: mergedContent.type,
      rating: liveRating || mergedContent.imdbRating,
      isFetched: !!(liveRating || mergedContent.imdbRating)
    };
  }, [mergedContent, genres, liveRating]);

  const recommendedMovies = useMemo(() => {
    if (!mergedContent || contentList.length === 0) return [];
    
    const currentId = mergedContent.id;
    const currentGenres = mergedContent.genreIds || [];
    const currentLangs = mergedContent.languageIds || [];
    
    const scored = contentList
      .filter(c => c.id !== currentId && c.status === 'published')
      .map(c => {
        let score = 0;
        
        if (c.genreIds) {
          const commonGenres = c.genreIds.filter(g => currentGenres.includes(g));
          score += commonGenres.length * 2;
        }
        
        if (c.languageIds) {
          const commonLangs = c.languageIds.filter(l => currentLangs.includes(l));
          score += commonLangs.length * 1;
        }
        
        recentlyViewed.forEach(rv => {
          if (rv.id !== c.id) {
             if (c.genreIds && rv.genreIds) {
               const common = c.genreIds.filter(g => rv.genreIds?.includes(g));
               score += common.length * 0.5;
             }
          }
        });
        
        return { content: c, score };
      });
      
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.content.createdAt ? new Date(a.content.createdAt).getTime() : 0;
      const bTime = b.content.createdAt ? new Date(b.content.createdAt).getTime() : 0;
      return bTime - aTime;
    });
    
    return scored.slice(0, settings?.recommendedLimit || 10).map(s => s.content);
  }, [mergedContent, contentList, recentlyViewed, settings?.recommendedLimit]);

  useEffect(() => {
    if (!contentLoading) {
      // If we have at least the basic content from the list, stop loading
      // This allows the page to show metadata while links fetch in background
      if (content) {
        setLoading(false);
      } 
      // If not in list, wait for the full fetch to complete or fail
      else if ((fullContent && fullContent.id === id) || fetchFailed || isOffline) {
        setLoading(false);
      }

      if (mergedContent && !hasLoggedView.current && profile?.uid) {
        hasLoggedView.current = true;
        logEvent('content_click', profile.uid, {
          contentId: mergedContent.id,
          contentTitle: mergedContent.title
        });

        // Add to recently viewed
        try {
          const recentStr = localStorage.getItem('recently_viewed');
          let recent: Content[] = recentStr ? JSON.parse(recentStr) : [];
          // Remove if already exists
          recent = recent.filter(c => c.id !== mergedContent.id);
          
          // Save full content to local storage for offline access
          localStorage.setItem(`movie_details_${mergedContent.id}`, JSON.stringify(mergedContent));

          // Add to front, keep full data as requested
          recent.unshift(mergedContent);
          // Keep max 100
          if (recent.length > 100) recent = recent.slice(0, 100);
          localStorage.setItem('recently_viewed', JSON.stringify(recent));
        } catch (e) {
          console.error("Failed to update recently viewed", e);
        }
      }
    }
  }, [content, contentLoading, profile?.uid, fullContent, mergedContent, fetchFailed, isOffline]);

  // Removed buggy popstate logic for popups

  const hasAttemptedStaticFetch = useRef<Record<string, boolean>>({});
  const hasAttemptedRatingFetch = useRef<Record<string, boolean>>({});

  // Fetch Live IMDb Rating independently
  useEffect(() => {
    if (!mergedContent || !id || hasAttemptedRatingFetch.current[id] || isOffline) return;

    const fetchRating = async () => {
      const ratingCacheKey = `imdb_rating_${id}`;
      const hasLiveRating = sessionStorage.getItem(ratingCacheKey);
      
      // Show cached immediately if available
      if (hasLiveRating) {
        setLiveRating(hasLiveRating);
        if (mergedContent.imdbRating !== hasLiveRating) {
          setCachedMetadata(prev => {
            const newCache = { ...prev.data, imdbRating: hasLiveRating };
            localStorage.setItem(`content_cache_${id}`, JSON.stringify(newCache));
            return { ...prev, data: newCache };
          });
        }
      }

      let imdbId = mergedContent.imdbLink?.match(/tt\d+/)?.[0];
      if (!imdbId) {
        // If no IMDb ID, we might need to wait for static fetch to find it.
        // Don't mark as attempted so it can run again when imdbLink is updated.
        return; 
      }

      hasAttemptedRatingFetch.current[id] = true;
      setFetchingImdb(true);
      try {
        const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY || '19daa310';
        const omdbRes = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`);
        const omdbData = await omdbRes.json();
        if (omdbData.imdbRating && omdbData.imdbRating !== 'N/A') {
          const newRating = `${omdbData.imdbRating}/10`;
          sessionStorage.setItem(ratingCacheKey, newRating);
          setLiveRating(newRating);
          
          if (mergedContent.imdbRating !== newRating) {
            setCachedMetadata(prev => {
              const newCache = { ...prev.data, imdbRating: newRating };
              localStorage.setItem(`content_cache_${id}`, JSON.stringify(newCache));
              return { ...prev, data: newCache };
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch live IMDb rating:", err);
      } finally {
        setFetchingImdb(false);
      }
    };

    fetchRating();
  }, [mergedContent?.id, mergedContent?.imdbLink, id, isOffline]);

  const fetchMissingData = async (force = false) => {
    if (!mergedContent || !id || isOffline) return;
    if (!force && hasAttemptedStaticFetch.current[id]) return;

    // If we are currently fetching the full document from Firebase, wait for it
    if (isMinimal && (!fullContent || fullContent.id !== id) && !fetchFailed) return;

    let seasons: any[] = [];
    try {
      // Prioritize seasons from database (fullContent) to ensure links are preserved
      const validFullContent = fullContent?.id === id ? fullContent : null;
      const seasonsSource = (validFullContent?.type === 'series' && validFullContent.seasons) ? validFullContent.seasons : mergedContent?.seasons;
      seasons = mergedContent?.type === 'series' && seasonsSource ? (Array.isArray(seasonsSource) ? seasonsSource : JSON.parse(seasonsSource || '[]')) : [];
    } catch (e) {
      console.error("Error parsing seasons in fetchMissingData:", e);
    }
    const needsEpisodeData = mergedContent?.type === 'series' && seasons.some((s: any) => !s.episodes || s.episodes.length <= 1 || s.episodes.some((ep: any) => !ep.description || !ep.duration));
    
    const needsStaticData = force || !mergedContent.runtime || !mergedContent.description || (!mergedContent.cast || mergedContent.cast.length === 0) || !mergedContent.releaseDate || !mergedContent.posterUrl || !mergedContent.country || !mergedContent.trailerUrl || !mergedContent.imdbLink || (!mergedContent.genreIds || mergedContent.genreIds.length === 0) || needsEpisodeData;

    if (!needsStaticData) {
      return;
    }

    hasAttemptedStaticFetch.current[id] = true;
    setFetchingImdb(true);

    try {
      const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || 'f71c2391161526fa9d19bd0b2759efaf';
      
      let tmdbData: any = null;
      let imdbId = mergedContent.imdbLink?.match(/tt\d+/)?.[0];

      // 1. Try IMDb ID first
      if (imdbId) {
        const findRes = await fetch(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
        const findData = await findRes.json();
        // Try the expected type first, but fall back to the other type if not found
        let results = mergedContent.type === 'series' ? findData.tv_results : findData.movie_results;
        let foundType = mergedContent.type === 'series' ? 'tv' : 'movie';
        
        if (!results || results.length === 0) {
          results = mergedContent.type === 'series' ? findData.movie_results : findData.tv_results;
          foundType = mergedContent.type === 'series' ? 'movie' : 'tv';
        }
        
        if (results && results.length > 0) {
          tmdbData = results[0];
          tmdbData.media_type = foundType; // Store the actual found type
        }
      }

      // 2. Try Title + Year if not found
      if (!tmdbData && mergedContent.title) {
        const searchType = mergedContent.type === 'series' ? 'tv' : 'movie';
        let searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(mergedContent.title)}`;
        if (mergedContent.year) {
          searchUrl += mergedContent.type === 'series' ? `&first_air_date_year=${mergedContent.year}` : `&primary_release_year=${mergedContent.year}`;
        }
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        if (searchData.results && searchData.results.length > 0) {
          tmdbData = searchData.results[0];
          tmdbData.media_type = searchType;
          // If we found it by title, try to get the IMDb ID for OMDB
          const detailsRes = await fetch(`https://api.themoviedb.org/3/${searchType}/${tmdbData.id}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`);
          const detailsData = await detailsRes.json();
          if (detailsData.external_ids?.imdb_id) {
            imdbId = detailsData.external_ids.imdb_id;
          }
        } else {
          // Fallback to the other type if title search fails
          const fallbackType = searchType === 'tv' ? 'movie' : 'tv';
          let fallbackUrl = `https://api.themoviedb.org/3/search/${fallbackType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(mergedContent.title)}`;
          if (mergedContent.year) {
            fallbackUrl += fallbackType === 'tv' ? `&first_air_date_year=${mergedContent.year}` : `&primary_release_year=${mergedContent.year}`;
          }
          const fallbackRes = await fetch(fallbackUrl);
          const fallbackData = await fallbackRes.json();
          if (fallbackData.results && fallbackData.results.length > 0) {
            tmdbData = fallbackData.results[0];
            tmdbData.media_type = fallbackType;
            const detailsRes = await fetch(`https://api.themoviedb.org/3/${fallbackType}/${tmdbData.id}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`);
            const detailsData = await detailsRes.json();
            if (detailsData.external_ids?.imdb_id) {
              imdbId = detailsData.external_ids.imdb_id;
            }
          }
        }
      }

      const updates: Partial<Content> = {};
      let hasUpdates = false;

      if (tmdbData) {
        const typePath = tmdbData.media_type || (mergedContent.type === 'series' ? 'tv' : 'movie');
        const detailsRes = await fetch(`https://api.themoviedb.org/3/${typePath}/${tmdbData.id}?api_key=${TMDB_API_KEY}&append_to_response=credits,external_ids,videos`);
        const details = await detailsRes.json();

        if ((force || !mergedContent.description) && details.overview) { updates.description = details.overview; hasUpdates = true; }
        if ((force || !mergedContent.releaseDate) && (details.release_date || details.first_air_date)) { updates.releaseDate = details.release_date || details.first_air_date; hasUpdates = true; }
        if ((force || !mergedContent.posterUrl) && details.poster_path) { updates.posterUrl = `https://image.tmdb.org/t/p/w500${details.poster_path}`; hasUpdates = true; }
        
        if ((force || !mergedContent.trailerUrl) && details.videos?.results) {
          const trailer = details.videos.results.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
          if (trailer) {
            updates.trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
            hasUpdates = true;
          }
        }

        if (force || !mergedContent.runtime) {
          if (details.runtime) { updates.runtime = `${details.runtime} min`; hasUpdates = true; }
          else if (details.episode_run_time && details.episode_run_time.length > 0) { updates.runtime = `${details.episode_run_time[0]} min/episode`; hasUpdates = true; }
        }

        if (force || !mergedContent.country) {
          const countryStr = details.production_countries?.map((c: any) => c.name).join(', ') || (details.origin_country ? details.origin_country.join(', ') : '');
          if (countryStr) {
            updates.country = countryStr;
            hasUpdates = true;
          }
        }

        if ((force || !mergedContent.cast || mergedContent.cast.length === 0) && details.credits?.cast) {
          updates.cast = details.credits.cast.slice(0, 5).map((a: any) => a.name);
          hasUpdates = true;
        }

        if ((force || !mergedContent.imdbLink) && details.external_ids?.imdb_id) {
          updates.imdbLink = `https://www.imdb.com/title/${details.external_ids.imdb_id}`;
          imdbId = details.external_ids.imdb_id;
          hasUpdates = true;
        }
        
        if ((force || !mergedContent.genreIds || mergedContent.genreIds.length === 0) && details.genres) {
          const matchedGenreIds: string[] = [];
          details.genres.forEach((tg: any) => {
            const match = genres.find(g => g.name.toLowerCase() === tg.name.toLowerCase());
            if (match) matchedGenreIds.push(match.id);
          });
          if (matchedGenreIds.length > 0) {
            updates.genreIds = matchedGenreIds;
            hasUpdates = true;
          }
        }

        // Episode Data Fetching for Series
        if (mergedContent.type === 'series' && mergedContent.seasons) {
          try {
            let seasonsUpdated = false;
            const currentSeasons = [...seasons];

            for (let i = 0; i < currentSeasons.length; i++) {
              const season = currentSeasons[i];
              const seasonRes = await fetch(`https://api.themoviedb.org/3/tv/${tmdbData.id}/season/${season.seasonNumber}?api_key=${TMDB_API_KEY}`);
              const seasonData = await seasonRes.json();

              if (seasonData.air_date && !season.year) {
                season.year = parseInt(seasonData.air_date.split('-')[0]);
                seasonsUpdated = true;
              }

              if (seasonData.episodes) {
                const existingEpisodes = season.episodes || [];
                const mergedEpisodes = seasonData.episodes.map((tmdbEp: any) => {
                  const existingEp = existingEpisodes.find((ep: any) => ep.episodeNumber === tmdbEp.episode_number);
                  if (existingEp) {
                    return {
                      ...existingEp,
                      description: existingEp.description || tmdbEp.overview || '',
                      duration: existingEp.duration || (tmdbEp.runtime ? `${tmdbEp.runtime} min` : '')
                    };
                  }
                  return {
                    id: `e${tmdbEp.episode_number}`,
                    episodeNumber: tmdbEp.episode_number,
                    title: tmdbEp.name || `Episode ${tmdbEp.episode_number}`,
                    description: tmdbEp.overview || '',
                    duration: tmdbEp.runtime ? `${tmdbEp.runtime} min` : '',
                    links: []
                  };
                });
                const existingOnly = existingEpisodes.filter((ep: any) => !seasonData.episodes.some((te: any) => te.episode_number === ep.episodeNumber));
                season.episodes = [...mergedEpisodes, ...existingOnly].sort((a, b) => a.episodeNumber - b.episodeNumber);
                seasonsUpdated = true;
              }
            }

            if (seasonsUpdated) {
              updates.seasons = JSON.stringify(currentSeasons);
              hasUpdates = true;
            }
          } catch (e) {
            console.error("Error auto-fetching episode data:", e);
          }
        }
      }

      if (hasUpdates) {
        setCachedMetadata(prev => {
          if (prev.id !== id) return prev;
          const newCache = { ...prev.data, ...updates };
          localStorage.setItem(`content_cache_${id}`, JSON.stringify(newCache));
          return { ...prev, data: newCache };
        });
      }

    } catch (err) {
      console.error("Auto-fetch failed:", err);
    } finally {
      setFetchingImdb(false);
    }
  };

  useEffect(() => {
    fetchMissingData();
  }, [mergedContent, id, genres, isOffline]);

  const getYouTubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
  };

  useEffect(() => {
    return () => {
      // Set flag when leaving MovieDetails to trigger WhatsApp prompt on Home
      sessionStorage.setItem('from_movie_details', 'true');
    };
  }, []);

  if (loading || profileLoading) {
    return <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div></div>;
  }

  const isAuthorized = mergedContent ? (
    profile?.role === 'admin' || 
    profile?.role === 'owner' || 
    profile?.role === 'content_manager' || 
    profile?.role === 'manager' || 
    mergedContent.status !== 'draft'
  ) : false;

  if (!mergedContent || !isAuthorized) {
    return <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center text-zinc-900 dark:text-white">Content not found</div>;
  }

  const isPending = profile?.status === 'pending';
  const isExpired = profile?.status === 'expired';
  const isSelectedContent = profile?.role === 'selected_content';
  const isAssigned = profile?.assignedContent?.some(id => id === mergedContent.id || id.startsWith(`${mergedContent.id}:`));
  const canPlay = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'content_manager' || profile?.role === 'manager' || (profile?.status === 'active' && (!(isSelectedContent || mergedContent.status === 'selected_content') || isAssigned));

  const allowedSeasons = profile?.assignedContent?.filter(id => id.startsWith(`${mergedContent.id}:`)).map(id => id.split(':')[1]) || [];
  const hasFullAccess = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'content_manager' || profile?.role === 'manager' || (profile && profile.status === 'active' && (!(isSelectedContent || mergedContent.status === 'selected_content'))) || profile?.assignedContent?.includes(mergedContent.id);

  const toggleWatchLater = async () => {
    if (!profile) return;
    setIsWatchLaterLoading(true);
    try {
      await authToggleWatchLater(mergedContent.id);
    } catch (error) {
      console.error("Error toggling watch later:", error);
    } finally {
      setIsWatchLaterLoading(false);
    }
  };

  const toggleFavorite = async () => {
    if (!profile) return;
    setIsFavoriteLoading(true);
    try {
      await authToggleFavorite(mergedContent.id);
    } catch (error) {
      console.error("Error toggling favorite:", error);
    } finally {
      setIsFavoriteLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteDoc(doc(db, 'content', id));
      navigate('/admin/content');
    } catch (error) {
      console.error('Error deleting content:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to delete content' });
    }
  };

  const handlePlayClick = (url: string, linkName?: string, linkId?: string, isZip?: boolean, tinyUrl?: string, isLocked?: boolean, seasonInfo?: { id: string; number: number; title?: string }) => {
    // Check eligibility before opening links
    const checkEligibility = () => {
      if (linkId === 'sample') return true;
      if (!profile) {
        setShowLoginPrompt(true);
        return false;
      }
      if (!canPlay || isLocked) {
        // Set locked content info for the alert modal
        if (mergedContent) {
          if (seasonInfo) {
            setLockedContentInfo({
              id: mergedContent.id,
              type: 'season',
              seasonId: seasonInfo.id,
              seasonNumber: seasonInfo.number,
              title: `${mergedContent.title} - Season ${seasonInfo.number}${seasonInfo.title ? ` (${seasonInfo.title})` : ''}`,
              price: settings?.seasonFee || 100
            });
          } else if (mergedContent.type === 'movie') {
            setLockedContentInfo({
              id: mergedContent.id,
              type: 'movie',
              title: mergedContent.title,
              price: settings?.movieFee || 50
            });
          }
        }

        if (isPending) {
          setAlertConfig({ 
            isOpen: true, 
            title: 'Account Pending', 
            message: 'Your account activation is pending. Please Get Membership or Add any content to cart to activate your account.' 
          });
        } else if (isExpired) {
          if (profile?.role === 'trial') {
            setAlertConfig({ isOpen: true, title: 'Trial Expired', message: 'Your free Trial has expired. Please get Membership to continue watching.' });
          } else {
            setAlertConfig({ isOpen: true, title: 'Membership Expired', message: 'Your membership has expired. Please renew to continue watching.' });
          }
        } else {
          setAlertConfig({ isOpen: true, title: 'Content Locked', message: 'This content is locked. Please contact admin to get access to this movie/series.' });
        }
        return false;
      }
      return true;
    };

    if (!checkEligibility()) return;

    if (isOffline) {
      setAlertConfig({ isOpen: true, title: 'No Internet', message: 'You need an internet connection to open this link.' });
      return;
    }
    
    setLinkPopup({ isOpen: true, url, name: linkName || 'Unknown Link', id: linkId || 'unknown', isZip, tinyUrl });
  };

  const closePosterPopup = () => {
    if (isPosterExpanded) {
      setIsPosterExpanded(false);
    }
  };

  const closeLinkPopup = () => {
    if (linkPopup) {
      setLinkPopup(null);
    }
  };

  const handlePlayExternal = async (player: 'vlc' | 'mx' | 'generic' | 'download' | 'browser') => {
    if (!linkPopup) return;
    
    if (profile?.uid) {
      logEvent('link_click', profile.uid, {
        contentId: mergedContent.id,
        contentTitle: mergedContent.title,
        linkId: linkPopup.id,
        linkName: linkPopup.name,
        playerType: player
      });
    }
    
    let urlToPlay = linkPopup.url;
    if (!urlToPlay.startsWith('http')) {
      urlToPlay = 'https://' + urlToPlay;
    }
    
    if (player === 'browser') {
      let browserUrl = urlToPlay;
      
      // Pixeldrain hotlink bypass: ensure we use the viewer page (/u/) for browser viewing
      browserUrl = browserUrl.replace(/(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/api\/file\//i, 'pixeldrain.dev/u/');
      browserUrl = browserUrl.replace(/(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/u\//i, 'pixeldrain.dev/u/');
      
      if (browserUrl.includes('pixeldrain.dev/u/')) {
        try {
          const urlObj = new URL(browserUrl);
          urlObj.search = ''; // Remove query params like ?download=true
          browserUrl = urlObj.toString();
        } catch (e) {}
      }

      const isAndroid = /Android/i.test(navigator.userAgent);
      if (isAndroid) {
        try {
          const urlObj = new URL(browserUrl);
          const scheme = urlObj.protocol.replace(':', '');
          const hostAndPath = urlObj.host + urlObj.pathname + urlObj.search + urlObj.hash;
          const intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};action=android.intent.action.VIEW;end`;
          window.location.href = intentUrl;
          closeLinkPopup();
          return;
        } catch (e) {
          console.error("Intent parsing failed", e);
        }
      }
      
      // Fallback for non-Android or if intent fails
      const html = `<!DOCTYPE html><html><head><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${browserUrl}"></head><body><script>window.location.replace("${browserUrl}");</script></body></html>`;
      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      closeLinkPopup();
      return;
    }

    if (player === 'download') {
      let copyUrl = urlToPlay;
      const isPixeldrain = copyUrl.includes('pixeldrain.com') || 
                          copyUrl.includes('pixeldrain.dev') || 
                          copyUrl.includes('pixeldrain.net') || 
                          copyUrl.includes('pixel.drain') ||
                          copyUrl.includes('pixeldra.in');
      
      if (!isPixeldrain) {
        if (linkPopup.tinyUrl) {
          copyUrl = linkPopup.tinyUrl;
        } else {
          try {
            const { generateTinyUrl } = await import('../../utils/tinyurl');
            copyUrl = await generateTinyUrl(copyUrl, false);
          } catch (e) {
            console.error("Failed to generate tinyurl on the fly", e);
          }
        }
      }

      navigator.clipboard.writeText(copyUrl).then(() => {
        setAlertConfig({
          isOpen: true,
          title: 'Link Copied!',
          message: 'The link has been copied to your clipboard.'
        });
      }).catch(err => {
        console.error('Failed to copy', err);
        setAlertConfig({
          isOpen: true,
          title: 'Copy Failed',
          message: 'Could not copy link. Please copy it manually: ' + copyUrl
        });
      });
      closeLinkPopup();
      return;
    }
    
    // For video players, we need the raw file API endpoint, not the viewer page
    let videoUrl = urlToPlay;
    if (player === 'vlc' || player === 'mx' || player === 'generic') {
      videoUrl = videoUrl.replace(/(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/u\//i, 'pixeldrain.dev/api/file/');
      videoUrl = videoUrl.replace(/(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/api\/file\//i, 'pixeldrain.dev/api/file/');
      
      if (videoUrl.includes('pixeldrain.dev/api/file/')) {
        try {
          const urlObj = new URL(videoUrl);
          urlObj.search = ''; // Remove query params
          videoUrl = urlObj.toString();
        } catch (e) {}
      }
    }
    
    try {
      const urlObj = new URL(videoUrl);
      const scheme = urlObj.protocol.replace(':', '');
      const hostAndPath = urlObj.host + urlObj.pathname + urlObj.search + urlObj.hash;
      const title = encodeURIComponent(mergedContent.title);
      
      let intentUrl = '';
      if (player === 'vlc') {
        intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};package=org.videolan.vlc;type=video/*;S.title=${title};end`;
      } else if (player === 'mx') {
        intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};package=com.mxtech.videoplayer.ad;type=video/*;S.title=${title};end`;
      } else {
        intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};action=android.intent.action.VIEW;type=video/*;end`;
      }
      
      window.location.href = intentUrl;
    } catch (e) {
      console.error("Invalid URL for external player", e);
      const a = document.createElement('a');
      a.href = videoUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    
    closeLinkPopup();
  };

  const handleReportLink = async () => {
    if (!profile || !linkPopup || !content) return;
    
    setIsReporting(true);
    try {
      // Check if already reported by this user
      const q = query(
        collection(db, 'reported_links'),
        where('userId', '==', profile.uid),
        where('linkId', '==', linkPopup.id),
        where('status', '==', 'pending')
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        setAlertConfig({ 
          isOpen: true, 
          title: 'Already Reported', 
          message: 'You have already reported this link. We are working on it!' 
        });
        setIsReporting(false);
        return;
      }

      await addDoc(collection(db, 'reported_links'), {
        userId: profile.uid,
        userName: profile.displayName || profile.email || 'Unknown User',
        contentId: mergedContent.id,
        contentTitle: mergedContent.title,
        contentType: mergedContent.type,
        linkId: linkPopup.id,
        linkName: linkPopup.name,
        linkUrl: linkPopup.url,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setAlertConfig({ isOpen: true, title: 'Report Submitted', message: 'Thank you for reporting. We will check and fix this link soon.' });
      closeLinkPopup();
    } catch (error) {
      console.error("Error reporting link:", error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to submit report. Please try again later.' });
    } finally {
      setIsReporting(false);
    }
  };

  const handlePlayDirectly = async () => {
    if (!linkPopup) return;
    
    if (profile?.uid) {
      logEvent('link_click', profile.uid, {
        contentId: mergedContent.id,
        contentTitle: mergedContent.title,
        linkId: linkPopup.id,
        linkName: linkPopup.name
      });
    }
    
    let url = linkPopup.url;
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    
    // Pixeldrain hotlink bypass: ensure we use the viewer page (/u/) for browser viewing
    url = url.replace(/(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/api\/file\//i, 'pixeldrain.dev/u/');
    url = url.replace(/(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/u\//i, 'pixeldrain.dev/u/');
    
    if (url.includes('pixeldrain.dev/u/')) {
      try {
        const urlObj = new URL(url);
        urlObj.search = ''; // Remove query params like ?download=true
        url = urlObj.toString();
      } catch (e) {}
    }
    
    window.open(url, '_blank', 'noopener,noreferrer');
    
    closeLinkPopup();
  };

  const contentGenres = genres.filter(g => mergedContent.genreIds?.includes(g.id)).map(g => g.name).join(', ');
  const contentLangs = languages.filter(l => mergedContent.languageIds?.includes(l.id)).map(l => l.name).join(', ');

  const renderLinks = (links: QualityLinks, isZip?: boolean, contextName?: string, isLocked?: boolean, seasonInfo?: { id: string; number: number; title?: string }) => {
    if (!Array.isArray(links)) return null;

    const validLinks = links.filter(l => l && l.url);
    if (validLinks.length === 0) return null;

    const getBytes = (size: string, unit: string) => {
      const val = parseFloat(size) || 0;
      return unit === 'GB' ? val * 1000 : val;
    };

    const sortedLinks = [...validLinks].sort((a, b) => getBytes(a.size, a.unit) - getBytes(b.size, b.unit));

    return (
      <div className="flex flex-wrap gap-3 justify-center">
        {sortedLinks.map((link) => {
          const fullName = contextName ? `${contextName} - ${link.name}` : link.name;
          return (
            <div key={link.id} className={`flex flex-col sm:flex-row items-stretch sm:items-center bg-zinc-100 dark:bg-zinc-800 rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-700 flex-1 min-w-[200px] max-w-sm ${isLocked ? 'opacity-60 grayscale-[0.5]' : ''}`}>
              <button
                onClick={() => handlePlayClick(link.url, fullName, link.id, isZip, link.tinyUrl, isLocked, seasonInfo)}
                className="flex-1 flex items-center justify-center gap-2 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-6 py-3 text-sm sm:text-base font-medium transition-colors border-b sm:border-b-0 sm:border-r border-zinc-300 dark:border-zinc-700"
                title={isLocked ? "Locked" : "Play"}
              >
                {isLocked ? <Lock className="w-5 h-5 shrink-0 text-amber-500" /> : <Play className="w-5 h-5 shrink-0" />}
                <span className="truncate">Play {link.name}</span>
              </button>
              <button
                onClick={() => handlePlayClick(link.url, fullName, link.id, isZip, link.tinyUrl, isLocked, seasonInfo)}
                className="flex items-center justify-center gap-2 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-6 py-3 text-sm sm:text-base font-medium transition-colors shrink-0"
                title={isLocked ? "Locked" : "Download"}
              >
                {isLocked ? <Lock className="w-5 h-5 shrink-0 text-amber-500" /> : <Download className="w-5 h-5 shrink-0" />}
                <span className="text-zinc-500 dark:text-zinc-400">({link.size} {link.unit})</span>
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const handleShare = async () => {
    if (!mergedContent) return;
    setIsShareLoading(true);
    
    let shareUrl = window.location.href;
    
    // Try to shorten the URL without the number alias
    shareUrl = await generateTinyUrl(shareUrl, false);

    const contentQuality = qualities.find(q => q.id === mergedContent.qualityId)?.name || 'N/A';
    
    const baseText = `🎬 ${formatContentTitle(mergedContent)} (${mergedContent.year})\n\n` +
                     `🗣️ Language: ${contentLangs || 'N/A'}\n` +
                     `🎭 Genre: ${contentGenres || 'N/A'}\n` +
                     `🖨️ Print Quality: ${contentQuality}\n\n` +
                     `Watch it here: ${shareUrl}`;
    
    const textForShare = baseText;
    const textForClipboard = baseText;

    const shareData: ShareData = {
      title: `${formatContentTitle(mergedContent)} (${mergedContent.year})`,
      text: textForShare,
    };

    try {
      // Try to include poster image
      if (mergedContent.posterUrl && navigator.canShare && navigator.canShare({ files: [] })) {
        try {
          const response = await fetch(mergedContent.posterUrl);
          const blob = await response.blob();
          const file = new File([blob], 'poster.jpg', { type: blob.type });
          shareData.files = [file];
        } catch (e) {
          console.error('Failed to fetch poster for sharing', e);
        }
      }

      if (navigator.share && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(textForClipboard);
        setAlertConfig({ isOpen: true, title: 'Success', message: 'Link and details copied to clipboard!' });
      }
    } catch (err) {
      console.error('Error sharing:', err);
    } finally {
      setIsShareLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white pb-20 transition-colors duration-300">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={imageUrl} />
        <meta property="og:url" content={pageUrl} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={imageUrl} />
      </Helmet>
      {/* Hero Section */}
      <div className="relative min-h-[60vh] md:min-h-[70vh] w-full flex flex-col justify-end">
        <div className="absolute inset-0 overflow-hidden">
          <LazyLoadImage
            src={mergedContent.posterUrl || settings?.defaultAppImage || 'https://picsum.photos/seed/movie/1920/1080'}
            alt={mergedContent.title}
            className="w-full h-full object-cover opacity-30"
            referrerPolicy="no-referrer"
            wrapperClassName="w-full h-full absolute inset-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-zinc-950 via-white/60 dark:via-zinc-950/60 to-transparent" />
        </div>
        
        <div className="absolute top-0 left-0 w-full p-4 z-[100] pointer-events-none flex justify-between items-center">
          <button 
            onClick={() => {
              sessionStorage.setItem('from_movie_details', 'true');
              navigate('/');
            }} 
            className="inline-flex items-center gap-2 text-white hover:text-emerald-400 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full transition-colors pointer-events-auto cursor-pointer border border-white/10"
          >
            <ArrowLeft className="w-5 h-5" /> Back
          </button>
          <div className="pointer-events-auto">
          </div>
        </div>

        <div className="relative z-10 flex items-end justify-center p-8 pt-32 pb-4 w-full">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center md:items-end gap-8 text-center md:text-left w-full">
            <LazyLoadImage 
              src={mergedContent.posterUrl || settings?.defaultAppImage || 'https://picsum.photos/seed/movie/400/600'} 
              alt={mergedContent.title} 
              className="w-48 md:w-64 rounded-2xl shadow-2xl cursor-pointer hover:scale-105 transition-transform border border-zinc-200 dark:border-zinc-800" 
              referrerPolicy="no-referrer" 
              onClick={() => setIsPosterExpanded(true)}
              wrapperClassName="w-48 md:w-64 shrink-0"
            />
            
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-4">
                <span className="bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  {mergedContent.type}
                </span>
                <span className="text-zinc-600 dark:text-zinc-300 font-medium">{mergedContent.year}</span>
                {mergedContent.qualityId && (() => {
                  const qualityObj = qualities.find(q => q.id === mergedContent.qualityId);
                  if (!qualityObj) return null;
                  return (
                    <span 
                      className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg"
                      style={{ 
                        backgroundColor: qualityObj.color || '#10b981',
                        color: getContrastColor(qualityObj.color || '#10b981')
                      }}
                    >
                      {qualityObj.name}
                    </span>
                  );
                })()}
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight drop-shadow-md">{formatContentTitle(mergedContent)}</h1>
              
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                {(mergedContent.trailerUrl || (mergedContent.type === 'series' && seasons.some(s => s.trailerUrl))) && (
                  <button 
                    onClick={() => {
                      if (allTrailers.length > 1) {
                        setIsTrailerSelectionOpen(true);
                      } else if (allTrailers.length === 1) {
                        setActiveTrailerUrl(allTrailers[0].url);
                        setIsTrailerPopupOpen(true);
                      }
                    }}
                    className={`${getYouTubeEmbedUrl(allTrailers[0]?.url || '') ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-500 hover:bg-emerald-600'} text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 border border-white/20 shadow-lg`}
                  >
                    {getYouTubeEmbedUrl(allTrailers[0]?.url || '') ? <Youtube className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    Watch Trailer
                  </button>
                )}
                {mergedContent.sampleUrl && (
                  <button 
                    onClick={() => handlePlayClick(mergedContent.sampleUrl!, 'Sample', 'sample')}
                    className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 border border-zinc-300 dark:border-zinc-700 shadow-sm"
                  >
                    <Play className="w-5 h-5" /> Sample
                  </button>
                )}
                {mergedContent.imdbLink && (
                  <a href={mergedContent.imdbLink} target="_blank" rel="noreferrer" className="bg-yellow-500 hover:bg-yellow-600 text-black px-6 py-3 text-sm sm:text-base rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg">
                    IMDb
                  </a>
                )}
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleWatchLater}
                    disabled={isWatchLaterLoading}
                    className={`p-3 sm:p-3.5 rounded-xl border transition-colors ${profile?.watchLater?.includes(mergedContent.id) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'} ${isWatchLaterLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Watch Later"
                  >
                    {isWatchLaterLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Clock className="w-5 h-5" />}
                  </button>
                  
                  <button
                    onClick={toggleFavorite}
                    disabled={isFavoriteLoading}
                    className={`p-3 sm:p-3.5 rounded-xl border transition-colors ${profile?.favorites?.includes(mergedContent.id) ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'} ${isFavoriteLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Favorite"
                  >
                    {isFavoriteLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className={`w-5 h-5 ${profile?.favorites?.includes(mergedContent.id) ? 'fill-current' : ''}`} />}
                  </button>

                  <button
                    onClick={handleShare}
                    disabled={isShareLoading}
                    className={`p-3 sm:p-3.5 rounded-xl border bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors ${isShareLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Share"
                  >
                    {isShareLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
                  </button>
                </div>

                {(profile?.role === 'admin' || profile?.role === 'owner') && (
                  <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
                    <button
                      onClick={() => setIsMediaModalOpen(true)}
                      className="px-6 py-3 text-sm sm:text-base rounded-xl border bg-cyan-500/10 border-cyan-500 text-cyan-500 hover:bg-cyan-500/20 transition-colors flex items-center gap-2"
                      title="Fetch Media Data"
                    >
                      <Search className="w-5 h-5" />
                      <span className="hidden sm:inline">Fetch</span>
                    </button>
                    <Link
                      to={`/admin/content?edit=${mergedContent.id}`}
                      className="px-6 py-3 text-sm sm:text-base rounded-xl border bg-emerald-500/10 border-emerald-500 text-emerald-500 hover:bg-emerald-500/20 transition-colors flex items-center gap-2"
                      title="Edit Content"
                    >
                      <Edit2 className="w-5 h-5" />
                      <span className="hidden sm:inline">Edit</span>
                    </Link>
                    <button
                      onClick={() => setDeleteId(mergedContent.id)}
                      className="px-6 py-3 text-sm sm:text-base rounded-xl border bg-red-500/10 border-red-500 text-red-500 hover:bg-red-500/20 transition-colors flex items-center gap-2"
                      title="Delete Content"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-8 pt-0 pb-12">
        {!profile ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-6 rounded-2xl mb-8 flex items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <Lock className="w-6 h-6 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-lg mb-1">Sign in required</h3>
                <p className="text-emerald-400 mb-0">
                  Please sign in or log in to access links and watch this content.
                </p>
              </div>
            </div>
            <button 
              onClick={() => navigate('/login', { state: { from: location.pathname } })}
              className="bg-emerald-500 text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-emerald-600 transition-colors whitespace-nowrap"
            >
              Log In
            </button>
          </div>
        ) : !canPlay && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-6 rounded-2xl mb-8 flex items-start gap-4">
            <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-lg mb-1">Access Restricted</h3>
              <p className="text-red-400 mb-4">
                {isPending ? 'Your account activation is pending. Please Get Membership or Add any content to cart to activate your account.' : 
                 isExpired ? (profile?.role === 'trial' ? 'Your free Trial has expired. Please get Membership to continue watching.' : 'Your membership has expired.') : 
                 'You do not have permission to access links for this content.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <a href={`https://wa.me/92${settings?.supportNumber || '3363284466'}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-red-500/20 px-6 py-3 text-sm sm:text-base rounded-xl font-medium hover:bg-red-500/30 transition-colors">
                  <MessageCircle className="w-5 h-5" /> Contact Admin ({settings?.supportNumber || '03363284466'})
                </a>
                {(((profile?.role === 'selected_content' || profile?.role === 'user') && !isExpired) || isPending) && mergedContent?.type === 'movie' && (
                  cart.some(item => item.contentId === mergedContent.id) ? (
                    <Link
                      to="/cart"
                      className="inline-flex items-center gap-2 bg-emerald-500 text-white px-6 py-3 text-sm sm:text-base rounded-xl font-medium hover:bg-emerald-600 transition-colors"
                    >
                      <ShoppingCart className="w-5 h-5 fill-current" />
                      View Cart
                    </Link>
                  ) : (
                    <button
                      onClick={() => {
                        addToCart({
                          contentId: mergedContent.id,
                          title: mergedContent.title,
                          type: 'movie',
                          price: settings?.movieFee || 50
                        });
                      }}
                      className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-500 px-6 py-3 text-sm sm:text-base rounded-xl font-medium hover:bg-emerald-500/30 transition-colors"
                    >
                      <ShoppingCart className="w-5 h-5" />
                      Add to Cart (Rs {settings?.movieFee || 50})
                    </button>
                  )
                )}
                {(profile?.role === 'selected_content' || profile?.role === 'user' || isPending) && !isExpired && mergedContent?.type === 'series' && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 w-full mt-2 italic">
                    Scroll down to add specific seasons to your cart.
                  </p>
                )}
                {(isExpired || isPending || profile?.role === 'trial' || profile?.role === 'user') && (
                  <Link to="/top-up" className="inline-flex items-center gap-2 bg-emerald-500 text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20">
                    {isExpired ? (profile?.role === 'trial' ? 'Buy Membership' : 'Renew Now') : 'Get Membership'}
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section>
              {displayData ? (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-8 relative overflow-hidden group">
                  <div className="flex-1 space-y-4">
                    <div className="relative">
                      <div className="float-right flex items-center gap-2 mb-2">
                        {displayData.rating && (
                          <div className="bg-[#f5c518] text-black px-2 py-1 rounded flex items-center gap-1.5 font-black text-xs shadow-[0_0_15px_rgba(245,197,24,0.3)] whitespace-nowrap">
                            <span className="bg-black text-[#f5c518] px-1 rounded-sm text-[10px] tracking-tighter">IMDb</span>
                            <div className="flex items-center gap-0.5">
                              <span className="text-[10px]">⭐</span>
                              <span>{displayData.rating.replace('/10', '')}</span>
                            </div>
                          </div>
                        )}
                        {fetchingImdb && (
                          <RefreshCw className="w-4 h-4 text-cyan-500 animate-spin" />
                        )}
                      </div>
                      <h3 className="text-3xl font-bold text-cyan-700 dark:text-cyan-400 leading-tight">
                        {displayData.title} {displayData.year ? `(${displayData.year})` : ''}
                      </h3>
                    </div>
                    
                    <div className="flex flex-wrap gap-6 text-sm font-medium text-cyan-700/80 dark:text-cyan-400/80">
                      {displayData.releaseDate && (
                        <div className="flex flex-col">
                          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Release Date</span>
                          <span>{formatReleaseDate(displayData.releaseDate)}</span>
                        </div>
                      )}
                      {displayData.duration && mergedContent.type !== 'series' && (
                        <div className="flex flex-col">
                          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Runtime</span>
                          <span>{formatRuntime(displayData.duration)}</span>
                        </div>
                      )}
                      {displayData.country && !displayData.country.includes(',') && (
                        <div className="flex flex-col">
                          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Country</span>
                          <span>{displayData.country}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-cyan-500/10">
                      {displayData.country && displayData.country.includes(',') && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-zinc-500 text-xs font-medium">Country</span>
                          <span className="text-sm font-medium text-cyan-700/80 dark:text-cyan-400/80">{displayData.country}</span>
                        </div>
                      )}
                      {displayData.genres && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-zinc-500 text-xs font-medium">Genre</span>
                          <span className="text-sm font-medium text-cyan-700/80 dark:text-cyan-400/80">{displayData.genres}</span>
                        </div>
                      )}
                      {contentLangs && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-zinc-500 text-xs font-medium">Language</span>
                          <span className="text-sm font-medium text-cyan-700/80 dark:text-cyan-400/80">{contentLangs}</span>
                        </div>
                      )}
                      {mergedContent.subtitles && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-zinc-500 text-xs font-medium">Subtitle</span>
                          <span className="text-sm font-medium text-cyan-700/80 dark:text-cyan-400/80">Yes</span>
                        </div>
                      )}
                    </div>
                    
                    {(displayData.castArray && displayData.castArray.length > 0) && (
                      <div className="pt-2">
                        <h4 className="text-sm font-bold text-cyan-700 dark:text-cyan-400 mb-2 uppercase tracking-wider opacity-70">Cast</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {displayData.castArray.map((actor, idx) => (
                            <span key={idx} className="bg-cyan-500/5 border border-cyan-500/10 px-2 py-1 rounded-md text-[11px] text-zinc-500 dark:text-zinc-400">
                              {actor}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(displayData.description || mergedContent.description) && (
                      <div className="pt-2">
                        <h4 className="text-sm font-bold text-cyan-700 dark:text-cyan-400 mb-1 uppercase tracking-wider opacity-70">Synopsis</h4>
                        <p className="text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed">{displayData.description || mergedContent.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-12">
                  <section className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-8 relative group">
                    <div className="relative mb-6">
                      {mergedContent.imdbRating && (
                        <div className="float-right ml-4 mb-2 bg-[#f5c518] text-black px-2 py-1 rounded flex items-center gap-1.5 font-black text-xs shadow-[0_0_15px_rgba(245,197,24,0.3)] whitespace-nowrap">
                          <span className="bg-black text-[#f5c518] px-1 rounded-sm text-[10px] tracking-tighter">IMDb</span>
                          <div className="flex items-center gap-0.5">
                            <span className="text-[10px]">⭐</span>
                            <span>{mergedContent.imdbRating.replace('/10', '')}</span>
                          </div>
                        </div>
                      )}
                      <h3 className="text-3xl font-bold text-cyan-700 dark:text-cyan-400 leading-tight">
                        {formatContentTitle(mergedContent)}
                      </h3>
                    </div>

                    <div className="flex flex-wrap gap-6 mb-8 text-sm font-medium text-cyan-700/80 dark:text-cyan-400/80">
                      {mergedContent.year && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg"><Clock className="w-4 h-4 text-cyan-500" /> {mergedContent.year}</span>}
                      {mergedContent.releaseDate && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg"><Film className="w-4 h-4 text-cyan-500" /> {formatReleaseDate(mergedContent.releaseDate)}</span>}
                      {mergedContent.runtime && mergedContent.type !== 'series' && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg"><Clock className="w-4 h-4 text-cyan-500" /> {formatRuntime(mergedContent.runtime)}</span>}
                      {mergedContent.country && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg"><Globe className="w-4 h-4 text-cyan-500" /> {mergedContent.country}</span>}
                      {contentGenres && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg">Genre: {contentGenres}</span>}
                      {contentLangs && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg">Language: {contentLangs}</span>}
                      {mergedContent.qualityId && (() => {
                        const qualityObj = qualities.find(q => q.id === mergedContent.qualityId);
                        if (!qualityObj) return null;
                        return (
                          <span 
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold shadow-lg"
                            style={{ 
                              backgroundColor: qualityObj.color || '#10b981',
                              color: getContrastColor(qualityObj.color || '#10b981')
                            }}
                          >
                            Quality: {qualityObj.name}
                          </span>
                        );
                      })()}
                    </div>
                    
                    {mergedContent.cast && mergedContent.cast.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-bold text-cyan-700 dark:text-cyan-400 mb-2 uppercase tracking-wider opacity-70">Cast</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {mergedContent.cast.map((actor, idx) => (
                            <span key={idx} className="bg-cyan-500/5 border border-cyan-500/10 px-2 py-1 rounded-md text-[11px] text-zinc-500 dark:text-zinc-400">
                              {actor}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <h3 className="text-sm font-bold mb-1 text-cyan-700 dark:text-cyan-400 uppercase tracking-wider opacity-70">Synopsis</h3>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed">{mergedContent.description}</p>
                  </section>
                </div>
              )}
            </section>

            {/* Links Section */}
            <section>
              <h2 className="text-2xl font-bold mb-6">Download & Play</h2>
              
              {mergedContent.type === 'movie' && mergedContent.movieLinks && (
                (() => {
                  try {
                    const links = Array.isArray(mergedContent.movieLinks) ? mergedContent.movieLinks : JSON.parse(mergedContent.movieLinks || '[]');
                    const rendered = renderLinks(links, false, undefined, !canPlay);
                    if (!rendered) return null;
                    return (
                      <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                        <h3 className="font-bold mb-4 text-zinc-500 dark:text-zinc-400">Movie Links</h3>
                        {rendered}
                      </div>
                    );
                  } catch (e) {
                    console.error("Error parsing movie links:", e);
                    return null;
                  }
                })()
              )}

              {mergedContent.type === 'series' && mergedContent.seasons && (
                <div className="space-y-6">
                  {(() => {
                    try {
                      const allSeasons = Array.isArray(mergedContent.seasons) ? mergedContent.seasons : JSON.parse(mergedContent.seasons || '[]');
                      const sortedSeasons = [...allSeasons].sort((a: Season, b: Season) => {
                        const aAccess = hasFullAccess || allowedSeasons.includes(a.id);
                        const bAccess = hasFullAccess || allowedSeasons.includes(b.id);
                        if (aAccess && !bAccess) return -1;
                        if (!aAccess && bAccess) return 1;
                        return a.seasonNumber - b.seasonNumber;
                      });

                      return sortedSeasons.map((season: Season) => {
                        const isAccessible = hasFullAccess || allowedSeasons.includes(season.id);
                        
                        return (
                        <div key={season.id} className={`bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden ${(!isAccessible && profile) ? 'opacity-75' : ''}`}>
                          <div className="bg-white/50 dark:bg-zinc-950/50 p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <h3 className="text-xl font-bold">
                              Season {season.seasonNumber} {season.title ? `- ${season.title}` : ''}
                              {season.year && <span className="text-sm text-zinc-500 ml-2">({season.year})</span>}
                            </h3>
                            <div className="flex flex-wrap items-center gap-3">
                              {(!isAccessible && profile) && (
                                <>
                                  <span className={`${isPending ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500'} px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2`}>
                                    <Lock className="w-4 h-4" /> {isPending ? 'Pending' : 'Restricted'}
                                  </span>
                                  {(((profile?.role === 'selected_content' || profile?.role === 'user') && profile?.status !== 'expired') || profile?.status === 'pending') && (
                                    cart.some(item => item.contentId === mergedContent.id && item.seasonId === season.id) ? (
                                      <Link
                                        to="/cart"
                                        className="bg-emerald-500 text-white px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-emerald-600 transition-colors"
                                      >
                                        <ShoppingCart className="w-4 h-4 fill-current" />
                                        View Cart
                                      </Link>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          addToCart({
                                            contentId: mergedContent.id,
                                            title: `${mergedContent.title} - Season ${season.seasonNumber}${season.title ? ` (${season.title})` : ''}`,
                                            type: 'season',
                                            seasonId: season.id,
                                            seasonNumber: season.seasonNumber,
                                            price: settings?.seasonFee || 100
                                          });
                                        }}
                                        className="bg-emerald-500/20 text-emerald-500 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-emerald-500/30 transition-colors"
                                      >
                                        <ShoppingCart className="w-4 h-4" />
                                        Add to Cart (Rs {settings?.seasonFee || 100})
                                      </button>
                                    )
                                  )}
                                  {(profile?.role === 'trial' || profile?.role === 'user') && (
                                    <Link to="/top-up" className="bg-emerald-500/20 text-emerald-500 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-emerald-500/30 transition-colors">
                                      Top Up Membership
                                    </Link>
                                  )}
                                </>
                              )}
                              {!profile && (
                                <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2">
                                  <Lock className="w-4 h-4" /> Sign in to watch
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="p-6 space-y-8">
                            {(() => {
                              const zipLinks = (season.zipLinks || []).filter(l => l && l.url);
                              const mkvLinks = (season.mkvLinks || []).filter(l => l && l.url);
                              
                              return (
                                <>
                                  {zipLinks.length > 0 && (
                                    <div>
                                      <h4 className="font-semibold text-zinc-500 dark:text-zinc-400 mb-3 text-sm uppercase tracking-wider">Full Season Zip</h4>
                                      {renderLinks(zipLinks, true, `S${season.seasonNumber} Zip`, !isAccessible, { id: season.id, number: season.seasonNumber, title: season.title })}
                                    </div>
                                  )}
                                  {mkvLinks.length > 0 && (
                                    <div>
                                      <h4 className="font-semibold text-zinc-500 dark:text-zinc-400 mb-3 text-sm uppercase tracking-wider">Full Season MKV</h4>
                                      {renderLinks(mkvLinks, false, `S${season.seasonNumber} MKV`, !isAccessible, { id: season.id, number: season.seasonNumber, title: season.title })}
                                    </div>
                                  )}
                                  
                                  {season.episodes && season.episodes.length > 0 && (
                                    <div>
                                      <h4 className="font-semibold text-zinc-500 dark:text-zinc-400 mb-4 text-sm uppercase tracking-wider">Episodes</h4>
                                      <div className="space-y-4">
                                        {season.episodes.map(ep => (
                                          <div key={ep.id} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
                                            <div className="flex flex-col gap-2">
                                              <div className="flex items-center flex-wrap gap-2">
                                                <span className="text-emerald-500 font-bold">E{ep.episodeNumber}</span>
                                                <span className="font-medium">{ep.title}</span>
                                                {ep.description && (
                                                  <button
                                                    onClick={() => setExpandedEpisodes(prev => ({ ...prev, [ep.id]: !prev[ep.id] }))}
                                                    className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-emerald-500 transition-colors"
                                                  >
                                                    {expandedEpisodes[ep.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                  </button>
                                                )}
                                                {ep.duration && (
                                                  <span className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded whitespace-nowrap">
                                                    {ep.duration}
                                                  </span>
                                                )}
                                              </div>
                                              
                                              {ep.description && expandedEpisodes[ep.id] && (
                                                <div className="text-sm text-zinc-500 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50 p-3 rounded-lg">
                                                  {ep.description}
                                                </div>
                                              )}
                                            </div>
                                            
                                            {ep.links && ep.links.length > 0 && (
                                              <div className="flex justify-center">
                                                {renderLinks(ep.links, false, `S${season.seasonNumber} E${ep.episodeNumber}`, !isAccessible, { id: season.id, number: season.seasonNumber, title: season.title })}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )});
                    } catch (e) {
                      console.error("Error parsing series seasons:", e);
                      return <p className="text-red-500">Error loading seasons</p>;
                    }
                  })()}
                </div>
              )}
            </section>

            {/* Recommended Movies Section */}
            {recommendedMovies.length > 0 && (
              <div className="mt-12">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Heart className="w-5 h-5 text-cyan-500" />
                    Recommended For You
                  </h2>
                </div>
                <div className="relative group">
                  <div 
                    className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory hide-scrollbar"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {recommendedMovies.map(recContent => (
                      <div key={recContent.id} className="min-w-[160px] sm:min-w-[200px] md:min-w-[240px] snap-start">
                        <ContentCard
                          content={recContent}
                          profile={profile}
                          qualities={qualities}
                          languages={languages}
                          genres={genres}
                          onToggleFavorite={authToggleFavorite}
                          onToggleWatchLater={authToggleWatchLater}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Content"
        message="Are you sure you want to delete this content? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      <AnimatePresence>
        {linkPopup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={closeLinkPopup}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full relative shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={closeLinkPopup}
                className="absolute top-4 right-4 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
              <h3 className="text-xl font-bold mb-2">Play Content</h3>
              <p className="text-zinc-500 dark:text-zinc-400 mb-6">How would you like to open "{linkPopup.name}"?</p>
              <div className="flex flex-col gap-3">
                {!(linkPopup.isZip || linkPopup.name.toLowerCase().includes('zip') || linkPopup.url.toLowerCase().includes('.zip')) ? (
                  <>
                    <button
                      onClick={() => handlePlayExternal('generic')}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-6 text-base rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      <Play className="w-5 h-5" /> Play in Video Player
                    </button>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handlePlayExternal('mx')}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
                          <rect width="24" height="24" rx="6" fill="white" fillOpacity="0.2"/>
                          <path d="M16.5 12L9 16.5V7.5L16.5 12Z" fill="currentColor"/>
                        </svg>
                        MX Player
                      </button>
                      <button
                        onClick={() => handlePlayExternal('vlc')}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
                          <path d="M12 2L5 22H19L12 2Z" fill="currentColor"/>
                          <path d="M6.5 17H17.5" stroke="#ea580c" strokeWidth="2.5"/>
                          <path d="M9 10H15" stroke="#ea580c" strokeWidth="2.5"/>
                        </svg>
                        VLC Player
                      </button>
                    </div>
                  </>
                ) : null}

                <button
                  onClick={handleReportLink}
                  disabled={isReporting}
                  className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-500 font-bold py-3 px-6 text-base rounded-xl transition-colors flex items-center justify-center gap-2 border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isReporting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                  {isReporting ? 'Sending...' : 'Report Link (if not Working)'}
                </button>

                <button
                  onClick={() => handlePlayExternal('download')}
                  className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-3 px-6 text-base rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Copy className="w-5 h-5" /> Copy Link
                </button>

                <button
                  onClick={handlePlayDirectly}
                  className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 px-6 text-base rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" /> Download
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPosterExpanded && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[60] p-4"
            onClick={closePosterPopup}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-4xl max-h-[90vh] w-full flex justify-center"
            >
              <button
                onClick={closePosterPopup}
                className="absolute -top-12 right-0 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors bg-black/50 p-2 rounded-full"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
              <LazyLoadImage 
                src={mergedContent.posterUrl || settings?.defaultAppImage || 'https://picsum.photos/seed/movie/400/600'} 
                alt={mergedContent.title} 
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" 
                referrerPolicy="no-referrer" 
                onClick={(e) => e.stopPropagation()}
                wrapperClassName="max-w-full max-h-[90vh]"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Trailer Selection Modal */}
      <AnimatePresence>
        {isTrailerSelectionOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4"
            onClick={() => setIsTrailerSelectionOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full relative shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsTrailerSelectionOpen(false)}
                className="absolute top-4 right-4 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <h3 className="text-xl font-bold mb-4 text-zinc-900 dark:text-white">Select Trailer</h3>
              <div className="flex flex-col gap-3">
                {allTrailers.map((trailer, idx) => {
                  const label = trailer.title || (trailer.seasonNumber ? `Season ${trailer.seasonNumber} Trailer` : (trailer.youtubeTitle || `Trailer ${idx + 1}`));
                  return (
                    <button
                      key={trailer.id}
                      onClick={() => {
                        setActiveTrailerUrl(trailer.url);
                        setIsTrailerSelectionOpen(false);
                        // Use a small timeout to ensure state updates are processed
                        setTimeout(() => setIsTrailerPopupOpen(true), 50);
                      }}
                      className={`w-full font-bold py-3 px-6 text-base rounded-xl transition-colors flex items-center justify-between border ${
                        getYouTubeEmbedUrl(trailer.url)
                          ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20'
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/20'
                      }`}
                    >
                      <span>{label}</span>
                      <Play className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trailer Popup */}
      <AnimatePresence>
        {isTrailerPopupOpen && (activeTrailerUrl || mergedContent.trailerUrl) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-[100] p-4"
            onClick={() => {
              setIsTrailerPopupOpen(false);
              setActiveTrailerUrl(null);
            }}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] ring-1 ring-white/10" 
              onClick={e => e.stopPropagation()}
            >
              {getYouTubeEmbedUrl(activeTrailerUrl || mergedContent.trailerUrl || '') ? (
                <iframe
                  src={`${getYouTubeEmbedUrl(activeTrailerUrl || mergedContent.trailerUrl || '')}?autoplay=1`}
                  title="Trailer"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-900 dark:text-white gap-4 bg-zinc-50 dark:bg-zinc-900">
                  <Play className="w-16 h-16 opacity-50" />
                  <p>This trailer cannot be played directly here.</p>
                  <a href={activeTrailerUrl || mergedContent.trailerUrl || ''} target="_blank" rel="noreferrer" className="bg-emerald-500 hover:bg-emerald-600 px-6 py-3 text-sm sm:text-base rounded-xl font-bold transition-colors">
                    Open in New Tab
                  </a>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <ConfirmModal
        isOpen={showLoginPrompt}
        title="Sign in required"
        message="Please sign in or log in to access links and watch this content."
        onConfirm={() => navigate('/login', { state: { from: location.pathname } })}
        onCancel={() => setShowLoginPrompt(false)}
        confirmText="Log In"
        cancelText="Cancel"
      />
      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => {
          setAlertConfig(prev => ({ ...prev, isOpen: false }));
          setLockedContentInfo(null);
        }}
        title={alertConfig.title}
        message={alertConfig.message}
      >
        {(alertConfig.title === 'Account Pending' || alertConfig.title === 'Trial Expired' || alertConfig.title === 'Membership Expired' || alertConfig.title === 'Content Locked') && (
          <div className="flex flex-col gap-3">
            {lockedContentInfo && !isExpired && (
              cart.some(item => 
                item.contentId === lockedContentInfo.id && 
                (lockedContentInfo.type === 'movie' || item.seasonId === lockedContentInfo.seasonId)
              ) ? (
                <Link to="/cart" className="flex items-center justify-center gap-2 bg-emerald-500 text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20">
                  <ShoppingCart className="w-5 h-5 fill-current" /> View Cart
                </Link>
              ) : (
                <button
                  onClick={() => {
                    addToCart({
                      contentId: lockedContentInfo.id,
                      title: lockedContentInfo.title,
                      type: lockedContentInfo.type,
                      seasonId: lockedContentInfo.seasonId,
                      seasonNumber: lockedContentInfo.seasonNumber,
                      price: lockedContentInfo.price
                    });
                    setLockedContentInfo(null);
                    setAlertConfig(prev => ({ ...prev, isOpen: false }));
                  }}
                  className="flex items-center justify-center gap-2 bg-emerald-500 text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <ShoppingCart className="w-5 h-5" /> Add to Cart (Rs {lockedContentInfo.price})
                </button>
              )
            )}
            {(profile?.role === 'trial' || profile?.role === 'user' || isExpired) && (
              <Link to="/top-up" className="flex items-center justify-center gap-2 bg-emerald-500 text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20">
                {isExpired ? (profile?.role === 'trial' ? 'Buy Membership' : 'Renew Now') : 'Get Membership'}
              </Link>
            )}
            {(profile?.role === 'selected_content' || profile?.role === 'user') && !isExpired && (
              <Link to="/cart" className="flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all">
                <ShoppingCart className="w-5 h-5" /> Cart
              </Link>
            )}
            <a href={`https://wa.me/92${settings?.supportNumber || '3363284466'}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all">
              <MessageCircle className="w-5 h-5" /> Admin
            </a>
          </div>
        )}
      </AlertModal>

      {isMediaModalOpen && mergedContent && (
        <MediaModal
          isOpen={isMediaModalOpen}
          onClose={() => setIsMediaModalOpen(false)}
          onApply={async (data) => {
            try {
              const contentRef = doc(db, 'content', mergedContent.id);
              const updateData: any = { ...data };
              
              // Map genre names to IDs if genres are provided
              if (data.genres && Array.isArray(data.genres)) {
                const matchedGenreIds: string[] = [];
                data.genres.forEach((gName: string) => {
                  const match = genres.find(g => g.name.toLowerCase() === gName.toLowerCase());
                  if (match) matchedGenreIds.push(match.id);
                });
                if (matchedGenreIds.length > 0) {
                  updateData.genreIds = matchedGenreIds;
                  delete updateData.genres;
                }
              }

              // Map cast string to array if provided
              if (data.cast && typeof data.cast === 'string') {
                updateData.cast = data.cast.split(',').map((s: string) => s.trim()).filter(Boolean);
              }
              
              // Handle seasons if they are in the data
              if (data.seasons && Array.isArray(data.seasons)) {
                let currentSeasons: any[] = [];
                try {
                  currentSeasons = JSON.parse(mergedContent.seasons || '[]');
                } catch (e) {
                  console.error("Error parsing seasons in onApply:", e);
                }
                
                data.seasons.forEach((fetchedSeason: any) => {
                  const existingSeasonIndex = currentSeasons.findIndex((s: any) => s.seasonNumber === fetchedSeason.seasonNumber);
                  
                  if (existingSeasonIndex !== -1) {
                    const existingSeason = currentSeasons[existingSeasonIndex];
                    if (fetchedSeason.seasonYear) existingSeason.year = fetchedSeason.seasonYear;
                    
                    fetchedSeason.episodes.forEach((fetchedEp: any) => {
                      const existingEpIndex = existingSeason.episodes.findIndex((ep: any) => ep.episodeNumber === fetchedEp.episodeNumber);
                      if (existingEpIndex !== -1) {
                        existingSeason.episodes[existingEpIndex] = {
                          ...existingSeason.episodes[existingEpIndex],
                          title: fetchedEp.title || existingSeason.episodes[existingEpIndex].title,
                          description: fetchedEp.description || existingSeason.episodes[existingEpIndex].description,
                          duration: fetchedEp.duration || existingSeason.episodes[existingEpIndex].duration,
                        };
                      } else {
                        existingSeason.episodes.push({
                          id: Math.random().toString(36).substr(2, 9),
                          episodeNumber: fetchedEp.episodeNumber,
                          title: fetchedEp.title || `Episode ${fetchedEp.episodeNumber}`,
                          description: fetchedEp.description || '',
                          duration: fetchedEp.duration || '',
                          links: [{ id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'MB' }],
                        });
                      }
                    });
                    existingSeason.episodes.sort((a: any, b: any) => a.episodeNumber - b.episodeNumber);
                  } else {
                    currentSeasons.push({
                      id: Math.random().toString(36).substr(2, 9),
                      seasonNumber: fetchedSeason.seasonNumber,
                      year: fetchedSeason.seasonYear,
                      zipLinks: [
                        { id: Math.random().toString(36).substr(2, 9), name: '480p', url: '', size: '', unit: 'GB' },
                        { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'GB' },
                        { id: Math.random().toString(36).substr(2, 9), name: '1080p', url: '', size: '', unit: 'GB' }
                      ],
                      mkvLinks: [
                        { id: Math.random().toString(36).substr(2, 9), name: '480p', url: '', size: '', unit: 'GB' },
                        { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'GB' },
                        { id: Math.random().toString(36).substr(2, 9), name: '1080p', url: '', size: '', unit: 'GB' }
                      ],
                      episodes: fetchedSeason.episodes.map((ep: any) => ({
                        id: Math.random().toString(36).substr(2, 9),
                        episodeNumber: ep.episodeNumber,
                        title: ep.title || `Episode ${ep.episodeNumber}`,
                        description: ep.description || '',
                        duration: ep.duration || '',
                        links: [{ id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'MB' }],
                      })).sort((a: any, b: any) => a.episodeNumber - b.episodeNumber)
                    });
                  }
                });
                updateData.seasons = JSON.stringify(currentSeasons.sort((a: any, b: any) => a.seasonNumber - b.seasonNumber));
              }

              await updateDoc(contentRef, updateData);
              
              if (fullContent) {
                const updatedFullContent = { ...fullContent, ...updateData };
                setFullContent(updatedFullContent);
                localStorage.setItem(`movie_details_${id}`, JSON.stringify(updatedFullContent));
              } else if (content) {
                const updatedContent = { ...content, ...updateData };
                localStorage.setItem(`movie_details_${id}`, JSON.stringify(updatedContent));
              }
              
              // Update cachedMetadata with the new data to prevent flickering before onSnapshot fires
              setCachedMetadata(prev => {
                const newCache = { ...prev.data, ...updateData };
                localStorage.setItem(`content_cache_${id}`, JSON.stringify(newCache));
                return { ...prev, data: newCache };
              });
              sessionStorage.removeItem(`content_cache_${id}`);
              
              setIsMediaModalOpen(false);
              setAlertConfig({ isOpen: true, title: 'Success', message: 'Content updated successfully' });
            } catch (error) {
              console.error("Error updating content:", error);
              setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update content' });
            }
          }}
          initialImdbId={mergedContent.imdbLink?.match(/tt\d+/)?.[0] || ''}
          initialTitle={mergedContent.title}
          initialYear={mergedContent.year?.toString() || ''}
        />
      )}
    </div>
  );
}
