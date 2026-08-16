import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Calendar,
  Film,
  Tv,
  Star,
  Play,
  X,
  Share2,
  RefreshCw,
  CheckCircle2,
  Tv2,
  Search,
  Image as ImageIcon,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Maximize2,
  Download,
  Languages,
  RotateCcw
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollableRow } from './ScrollableRow';
import { safeStorage } from '../utils/safeStorage';
import {
  fetchUpcomingCombined,
  fetchTMDBTrailer,
  fetchTMDBImages,
  predictOttPlatformWithAI,
  TMDBUpcomingItem,
  TMDBImagesResult
} from '../services/tmdb';
import { useLanguage } from '../contexts/LanguageContext';
import { useContent } from '../contexts/ContentContext';
import { useHaptics } from '../hooks/useHaptics';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { getOptimizedImageUrl } from '../utils/imageUtils';
import SharePreviewModal from './SharePreviewModal';

interface ComingSoonSectionProps {
  className?: string;
}

export const ComingSoonSection: React.FC<ComingSoonSectionProps> = ({ className }) => {
  const { t, language, translate } = useLanguage();
  const { vibrate } = useHaptics();
  const { contentList, qualities } = useContent();

  const [filter, setFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [items, setItems] = useState<TMDBUpcomingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [selectedItem, setSelectedItem] = useState<TMDBUpcomingItem | null>(null);
  const [isPlayingTrailer, setIsPlayingTrailer] = useState(false);
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const [loadingTrailer, setLoadingTrailer] = useState(false);
  const [trailerNotFound, setTrailerNotFound] = useState(false);
  const [itemImages, setItemImages] = useState<TMDBImagesResult>({ posters: [], backdrops: [] });
  const [loadingImages, setLoadingImages] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareModalData, setShareModalData] = useState<{
    isOpen: boolean;
    contentTitle?: string;
    posterUrl?: string | null;
    shareText: string;
    shareSubject?: string;
  }>({
    isOpen: false,
    shareText: '',
  });

  // AI Synopsis Translation state
  const [translatedSynopsis, setTranslatedSynopsis] = useState<string | null>(null);
  const [isTranslatingSynopsis, setIsTranslatingSynopsis] = useState(false);
  const [showOriginalSynopsis, setShowOriginalSynopsis] = useState(false);

  // Fullscreen Lightbox state
  const [fullscreenImageIndex, setFullscreenImageIndex] = useState<number | null>(null);
  const [isLightboxImageLoading, setIsLightboxImageLoading] = useState(true);

  // Section Visibility state
  const [isVisible, setIsVisible] = useState(() => safeStorage.getItem('home_coming_soon_visible') !== 'false');

  const toggleVisibility = () => {
    setIsVisible(prev => {
      const next = !prev;
      safeStorage.setItem('home_coming_soon_visible', next.toString());
      return next;
    });
  };

  // Touch Swipe handlers for Lightbox
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.hide-scrollbar, .overflow-x-auto, button')) {
      touchStartX.current = null;
      touchEndX.current = null;
      return;
    }
    touchEndX.current = null;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const distance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 40;

    if (distance > minSwipeDistance) {
      // Swiped Left -> Next Image
      if (allModalImages.length > 1) {
        vibrate(20);
        setIsLightboxImageLoading(true);
        setFullscreenImageIndex((prev) =>
          prev === null ? 0 : (prev + 1) % allModalImages.length
        );
      }
    } else if (distance < -minSwipeDistance) {
      // Swiped Right -> Previous Image
      if (allModalImages.length > 1) {
        vibrate(20);
        setIsLightboxImageLoading(true);
        setFullscreenImageIndex((prev) =>
          prev === null ? 0 : (prev - 1 + allModalImages.length) % allModalImages.length
        );
      }
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  useModalBehavior(!!selectedItem || isPlayingTrailer, () => {
    if (fullscreenImageIndex !== null) {
      setFullscreenImageIndex(null);
      return;
    }
    if (isPlayingTrailer) {
      setIsPlayingTrailer(false);
      return;
    }
    setSelectedItem(null);
    setIsPlayingTrailer(false);
    setTrailerUrl(null);
    setTrailerNotFound(false);
    setItemImages({ posters: [], backdrops: [] });
    setTranslatedSynopsis(null);
    setShowOriginalSynopsis(false);
  });

  const loadData = useCallback(async (forcedFilter?: 'all' | 'movie' | 'tv', isRefresh = false) => {
    const currentFilter = forcedFilter || filter;
    const cacheKey = `tmdb_coming_soon_ott_${currentFilter}`;

    if (!isRefresh) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setItems(parsed);
            setLoading(false);
            return;
          }
        }
      } catch (e) {}
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchUpcomingCombined(currentFilter);
      if (data && data.length > 0) {
        setItems(data);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (e) {}
      } else {
        setError(t('No upcoming releases found at this moment.'));
      }
    } catch (err: any) {
      setError(err?.message || t('Failed to fetch upcoming titles from TMDB.'));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    loadData(filter);
  }, [filter, loadData]);

  // AI-powered missing OTT platform resolution (Strictly max 2 attempts)
  const ottAttemptsRef = useRef<number>(0);

  useEffect(() => {
    // Reset attempts counter when filter changes
    ottAttemptsRef.current = 0;
  }, [filter]);

  useEffect(() => {
    if (!items || items.length === 0) return;
    if (ottAttemptsRef.current >= 2) return; // Strictly stop trying after 2 attempts

    const missingItems = items.filter(item => !item.ottPlatform);
    if (missingItems.length === 0) return;

    let isMounted = true;
    const fillMissingOtt = async () => {
      const remainingAllowed = 2 - ottAttemptsRef.current;
      if (remainingAllowed <= 0) return;

      const targetItems = missingItems.slice(0, remainingAllowed);
      for (const item of targetItems) {
        if (!isMounted || ottAttemptsRef.current >= 2) break;
        ottAttemptsRef.current += 1;

        try {
          const predicted = await predictOttPlatformWithAI(
            item.title,
            item.type,
            item.releaseDate ? item.releaseDate.split('-')[0] : undefined,
            item.overview,
            item.genres,
            item.originalTitle
          );
          if (predicted && isMounted) {
            setItems(prev => prev.map(p => p.id === item.id && p.type === item.type ? { ...p, ottPlatform: predicted } : p));
          } else if (!predicted) {
            // Stop trying if prediction unavailable or error
            break;
          }
          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          break;
        }
      }
    };

    fillMissingOtt();
    return () => { isMounted = false; };
  }, [items]);

  // Filter out items that are already present in library with an HD print (WEB-DL, HDRip, BluRay, WEBRip, BRRip)
  const visibleItems = useMemo(() => {
    if (!items || items.length === 0) return [];

    const isHdPrint = (str: string) => {
      const s = str.toLowerCase();
      const isHd =
        s.includes('web-dl') ||
        s.includes('webdl') ||
        s.includes('hdrip') ||
        s.includes('bluray') ||
        s.includes('blu-ray') ||
        s.includes('webrip') ||
        s.includes('brrip') ||
        s.includes('1080p') ||
        s.includes('2160p') ||
        s.includes('4k');
      const isLow =
        s.includes('cam') ||
        s.includes('hdcam') ||
        s.includes('predvd') ||
        s.includes('telesync') ||
        s.includes('hdts') ||
        s.includes('hdtc');
      return isHd && !isLow;
    };

    return items.filter((item) => {
      const normTitle = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normOrig = (item.originalTitle || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const matchedInLibrary = contentList.find((c) => {
        const cTitle = (c.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cSecond = (c.secondTitle || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const titleMatch =
          (normTitle && (cTitle === normTitle || (normTitle.length >= 4 && (cTitle.includes(normTitle) || normTitle.includes(cTitle))))) ||
          (normOrig && (cTitle === normOrig || cSecond === normOrig));

        if (!titleMatch) return false;

        // Compare release year if both available
        if (c.year && item.releaseDate) {
          const itemYear = parseInt(item.releaseDate.split('-')[0], 10);
          if (itemYear && Math.abs(c.year - itemYear) > 1) {
            return false;
          }
        }
        return true;
      });

      if (!matchedInLibrary) return true;

      // Check if library item has HD quality tag
      const qualityObj = qualities.find((q) => q.id === matchedInLibrary.qualityId);
      if (qualityObj?.name && isHdPrint(qualityObj.name)) {
        return false;
      }

      // Check movieLinks
      if (matchedInLibrary.movieLinks) {
        try {
          const links = JSON.parse(matchedInLibrary.movieLinks);
          if (Array.isArray(links)) {
            for (const l of links) {
              const lName = l.name || l.quality || '';
              if (isHdPrint(lName)) return false;
            }
          }
        } catch (e) {}
      }

      // Check seasons / episodes
      if (matchedInLibrary.seasons) {
        try {
          const seasons = JSON.parse(matchedInLibrary.seasons);
          if (Array.isArray(seasons)) {
            for (const s of seasons) {
              if (Array.isArray(s.episodes)) {
                for (const ep of s.episodes) {
                  if (Array.isArray(ep.links)) {
                    for (const l of ep.links) {
                      const lName = l.name || l.quality || '';
                      if (isHdPrint(lName)) return false;
                    }
                  }
                }
              }
            }
          }
        } catch (e) {}
      }

      return true;
    });
  }, [items, contentList, qualities]);

  // Open item modal: Load posters/backdrops, AI OTT detection if missing, and AI synopsis translation
  const handleOpenItem = async (item: TMDBUpcomingItem) => {
    vibrate(30);
    setSelectedItem(item);
    setIsPlayingTrailer(false);
    setTrailerUrl(null);
    setTrailerNotFound(false);
    setTranslatedSynopsis(null);
    setShowOriginalSynopsis(false);
    setLoadingImages(true);

    // If OTT platform is still missing, trigger AI prediction immediately
    if (!item.ottPlatform) {
      predictOttPlatformWithAI(
        item.title,
        item.type,
        item.releaseDate ? item.releaseDate.split('-')[0] : undefined,
        item.overview,
        item.genres
      ).then((predicted) => {
        if (predicted) {
          setSelectedItem(prev => prev && prev.id === item.id ? { ...prev, ottPlatform: predicted } : prev);
          setItems(prev => prev.map(p => p.id === item.id && p.type === item.type ? { ...p, ottPlatform: predicted } : p));
        }
      });
    }

    // Fetch official posters & backdrops
    try {
      const imagesData = await fetchTMDBImages(item.id, item.type);
      setItemImages(imagesData);
    } catch (e) {
      console.error('Error fetching images for upcoming item:', e);
      setItemImages({ posters: [], backdrops: [] });
    } finally {
      setLoadingImages(false);
    }
  };

  // AI Synopsis Translation effect for current item & language
  useEffect(() => {
    if (!selectedItem || !selectedItem.overview) {
      setTranslatedSynopsis(null);
      setIsTranslatingSynopsis(false);
      return;
    }

    if (language === 'en') {
      setTranslatedSynopsis(null);
      setIsTranslatingSynopsis(false);
      return;
    }

    let isCurrent = true;
    setIsTranslatingSynopsis(true);

    translate(selectedItem.overview)
      .then((translated) => {
        if (isCurrent) {
          setTranslatedSynopsis(translated);
          setIsTranslatingSynopsis(false);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setIsTranslatingSynopsis(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedItem, language, translate]);

  // Watch trailer action inside modal
  const handlePlayTrailer = async (item: TMDBUpcomingItem) => {
    vibrate(30);
    setIsPlayingTrailer(true);

    if (trailerUrl) return;

    setLoadingTrailer(true);
    setTrailerNotFound(false);
    try {
      const url = await fetchTMDBTrailer(item.id, item.type, item.title);
      if (url) {
        setTrailerUrl(url);
      } else {
        setTrailerNotFound(true);
      }
    } catch (e) {
      console.error('Error fetching trailer for upcoming item:', e);
      setTrailerNotFound(true);
    } finally {
      setLoadingTrailer(false);
    }
  };

  const formatReleaseDate = (dateStr?: string | null) => {
    if (!dateStr) return t('OTT Date TBA');
    try {
      const [year, month, day] = dateStr.split('-');
      if (!year) return t('OTT Date TBA');
      const date = new Date(Number(year), Number(month) - 1, Number(day || 1));
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: day ? 'numeric' : undefined
      });
    } catch (e) {
      return dateStr;
    }
  };

  const getDaysUntilRelease = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      const target = new Date(dateStr).getTime();
      const now = new Date().setHours(0, 0, 0, 0);
      const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
      if (diff > 0) {
        return diff === 1 ? t('Tomorrow') : `${diff} ${t('days left')}`;
      } else if (diff === 0) {
        return t('Releasing Today');
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const getYouTubeEmbedUrl = (url: string | null) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      return `https://www.youtube-nocookie.com/embed/${match[2]}?autoplay=1&rel=0&enablejsapi=1`;
    }
    return url;
  };

  const getOttBadgeConfig = (platform?: string | null) => {
    if (!platform) return null;
    const p = platform.toLowerCase();

    if (p.includes('netflix')) {
      return { name: 'Netflix', bg: 'bg-[#E50914] text-white border-[#E50914]' };
    }
    if (p.includes('amazon') || p.includes('prime')) {
      return { name: 'Prime Video', bg: 'bg-[#00A8E1] text-white border-[#00A8E1]' };
    }
    if (p.includes('disney')) {
      return { name: 'Disney+', bg: 'bg-[#113CCF] text-white border-[#113CCF]' };
    }
    if (p.includes('apple')) {
      return { name: 'Apple TV+', bg: 'bg-zinc-900 text-white border-zinc-700' };
    }
    if (p.includes('hbo') || p.includes('max')) {
      return { name: 'HBO Max', bg: 'bg-[#6814d4] text-white border-[#6814d4]' };
    }
    if (p.includes('hulu')) {
      return { name: 'Hulu', bg: 'bg-[#1ce783] text-black border-[#1ce783]' };
    }
    if (p.includes('paramount')) {
      return { name: 'Paramount+', bg: 'bg-[#0064ff] text-white border-[#0064ff]' };
    }
    if (p.includes('peacock')) {
      return { name: 'Peacock', bg: 'bg-[#00c2cb] text-black border-[#00c2cb]' };
    }
    if (p.includes('jiocinema') || p.includes('jio')) {
      return { name: 'JioCinema', bg: 'bg-pink-600 text-white border-pink-500' };
    }
    if (p.includes('zee5')) {
      return { name: 'Zee5', bg: 'bg-purple-700 text-white border-purple-500' };
    }
    if (p.includes('sonyliv') || p.includes('sony')) {
      return { name: 'SonyLIV', bg: 'bg-amber-600 text-white border-amber-500' };
    }
    if (p.includes('hotstar')) {
      return { name: 'Hotstar', bg: 'bg-[#0c2044] text-amber-400 border-amber-500/40' };
    }
    if (p.includes('crunchyroll')) {
      return { name: 'Crunchyroll', bg: 'bg-orange-500 text-white border-orange-400' };
    }

    return { name: platform, bg: 'bg-zinc-800 text-white border-zinc-700' };
  };

  const handleShare = (e: React.MouseEvent, item: TMDBUpcomingItem) => {
    e.stopPropagation();
    vibrate(30);
    const dateLabel = item.hasOttDate && item.releaseDate
      ? `OTT Release: ${formatReleaseDate(item.releaseDate)}`
      : 'OTT Release Coming Soon';
    const typeLabel = item.type === 'movie' ? 'Movie' : 'Series';
    const ottPlatformName = item.ottPlatform ? ` on ${item.ottPlatform}` : '';
    const shareText = `Check out upcoming ${typeLabel}: ${item.title} (${dateLabel}${ottPlatformName}) and many more on https://MovizNow.com`;

    setShareModalData({
      isOpen: true,
      contentTitle: item.title,
      posterUrl: item.posterPath || item.backdropPath,
      shareText,
      shareSubject: item.title,
    });
  };

  // Combine posters and backdrops for complete visual gallery in portrait format (posters first)
  const allModalImages = useMemo(() => {
    const list: { url: string; type: 'poster' | 'backdrop'; label: string }[] = [];
    if (selectedItem?.posterPath) {
      list.push({ url: selectedItem.posterPath, type: 'poster', label: 'Main Poster' });
    }
    itemImages.posters.forEach((p, idx) => {
      if (!list.some((item) => item.url === p)) {
        list.push({ url: p, type: 'poster', label: `Poster ${idx + 1}` });
      }
    });
    if (selectedItem?.backdropPath && !list.some((item) => item.url === selectedItem.backdropPath)) {
      list.push({ url: selectedItem.backdropPath, type: 'backdrop', label: 'Backdrop' });
    }
    itemImages.backdrops.forEach((b, idx) => {
      if (!list.some((item) => item.url === b)) {
        list.push({ url: b, type: 'backdrop', label: `Backdrop ${idx + 1}` });
      }
    });
    return list;
  }, [selectedItem, itemImages]);

  return (
    <div id="coming-soon-section" className={className || 'mb-8'}>
      {/* Section Header */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 mb-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 sm:p-2.5 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/10 border border-amber-500/30 text-amber-500 shadow-sm shrink-0">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h2 className="text-base sm:text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white flex items-center gap-1.5 sm:gap-2 whitespace-nowrap">
                {t('Coming Soon')}
                <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-bold rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 tracking-normal uppercase">
                  {t('OTT Releases')}
                </span>
              </h2>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium hidden sm:block">
              {t('Upcoming digital & OTT releases starting from today')}
            </p>
          </div>
        </div>

        {/* Filters, Refresh and Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
          <AnimatePresence>
            {isVisible && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-0.5 sm:gap-1 bg-zinc-100 dark:bg-zinc-900/90 p-0.5 sm:p-1 rounded-xl border border-zinc-200/80 dark:border-zinc-800"
              >
                <button
                  onClick={(e) => { e.stopPropagation(); vibrate(30); setFilter('all'); }}
                  className={clsx(
                    "px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap",
                    filter === 'all'
                      ? "bg-amber-500 text-black shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  )}
                >
                  {t('All')}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); vibrate(30); setFilter('movie'); }}
                  className={clsx(
                    "px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap",
                    filter === 'movie'
                      ? "bg-amber-500 text-black shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  )}
                >
                  {t('Movies')}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); vibrate(30); setFilter('tv'); }}
                  className={clsx(
                    "px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap",
                    filter === 'tv'
                      ? "bg-amber-500 text-black shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  )}
                >
                  {t('Series')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center bg-zinc-100 dark:bg-zinc-900/90 p-0.5 sm:p-1 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
            <button
              id="coming-soon-refresh-btn"
              onClick={() => {
                vibrate(30);
                loadData(filter, true);
              }}
              title={t('Refresh')}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin text-amber-500')} />
            </button>
          </div>
          <button 
            onClick={toggleVisibility} 
            className="p-1.5 sm:p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors shrink-0"
            title={isVisible ? t('Collapse Coming Soon') : t('Expand Coming Soon')}
          >
            {isVisible ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isVisible && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="pt-1">
              {/* Row content */}
              {loading && visibleItems.length === 0 ? (
                <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className="w-[140px] sm:w-[180px] md:w-[200px] h-[220px] sm:h-[270px] rounded-xl bg-zinc-200 dark:bg-zinc-900 animate-pulse shrink-0 border border-zinc-200 dark:border-zinc-800"
                    />
                  ))}
                </div>
              ) : error && visibleItems.length === 0 ? (
                <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-center">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">{error}</p>
                  <button
                    onClick={() => loadData(filter, true)}
                    className="px-4 py-2 text-xs font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-xl hover:bg-amber-500/20 transition-all"
                  >
                    {t('Try Again')}
                  </button>
                </div>
              ) : visibleItems.length === 0 ? (
                <div className="p-8 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800 text-center">
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    {t('All upcoming digital titles in this category are already available in HD print in our library!')}
                  </p>
                </div>
              ) : (
                <ScrollableRow
                  scrollKey="scroll_coming_soon"
                  className="flex overflow-x-auto gap-3 sm:gap-4 pb-4 snap-x snap-mandatory flex-nowrap hide-scrollbar"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {visibleItems.map((item) => {
            const daysLeft = item.hasOttDate && item.releaseDate ? getDaysUntilRelease(item.releaseDate) : null;
            const ottBadge = getOttBadgeConfig(item.ottPlatform);
            const typeLabel = item.type === 'movie' ? 'Movie' : 'Series';

            return (
              <div
                key={`${item.type}-${item.id}`}
                className="w-[140px] sm:w-[180px] md:w-[200px] shrink-0 snap-start"
              >
                <div
                  id={`coming-soon-card-${item.id}`}
                  onClick={() => handleOpenItem(item)}
                  className="group relative flex flex-col h-full rounded-xl overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 hover:border-amber-500/50 dark:hover:border-amber-500/50 shadow-sm hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-300 cursor-pointer transform-gpu"
                >
                  {/* Poster Thumbnail */}
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-950">
                    {item.posterPath ? (
                      <img
                        src={getOptimizedImageUrl(item.posterPath, 342)}
                        alt={item.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 bg-zinc-800/40 p-2 text-center">
                        <Film className="w-8 h-8 mb-2 opacity-30" />
                        <span className="text-[10px] font-medium">{t('No Poster')}</span>
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/25 to-transparent opacity-85 group-hover:opacity-95 transition-opacity" />

                    {/* Top Left: Star Rating Badge */}
                    {item.voteAverage > 0 && (
                      <div className="absolute top-2 left-2 z-10 pointer-events-none">
                        <div className="flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-black/85 text-yellow-400 border border-yellow-500/40 backdrop-blur-md shadow-lg">
                          <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-yellow-400 text-yellow-400 shrink-0" />
                          <span className="font-black text-xs sm:text-sm text-amber-300 dark:text-yellow-400 leading-none">
                            {item.voteAverage.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Top Right: Type Badge & OTT Platform Label */}
                    <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10 pointer-events-none">
                      {/* Movie / Series label */}
                      <span
                        className={clsx(
                          "px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wider text-white shadow-md border border-white/20 text-[9px] sm:text-[10px]",
                          item.type === 'movie' ? 'bg-blue-600' : 'bg-purple-600'
                        )}
                      >
                        {typeLabel}
                      </span>

                      {/* Actual OTT Platform Brand Badge */}
                      {ottBadge ? (
                        <span
                          className={clsx(
                            "px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black uppercase tracking-wider shadow-md border truncate max-w-[105px]",
                            ottBadge.bg
                          )}
                        >
                          {ottBadge.name}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-black/75 text-amber-400 border border-amber-500/30 backdrop-blur-md flex items-center gap-1">
                          <Tv2 className="w-2.5 h-2.5" />
                          OTT
                        </span>
                      )}
                    </div>

                    {/* Hover indicator */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-500 to-orange-400 text-black flex items-center justify-center shadow-lg shadow-amber-500/40 transform group-hover:scale-110 transition-transform">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                    </div>

                    {/* OTT Release Date & Countdown at Bottom of Poster */}
                    <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-0.5 pointer-events-none">
                      {daysLeft && (
                        <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wide text-amber-300 drop-shadow-md flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          {daysLeft}
                        </span>
                      )}
                      <div className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-white drop-shadow-md">
                        <Calendar className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="truncate">
                          {item.hasOttDate && item.releaseDate
                            ? `OTT: ${formatReleaseDate(item.releaseDate)}`
                            : t('OTT Date TBA')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Info */}
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 line-clamp-1 group-hover:text-amber-500 transition-colors">
                        {item.title}
                      </h3>
                      {item.genres && item.genres.length > 0 && (
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5 font-medium">
                          {item.genres.slice(0, 2).join(' • ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </ScrollableRow>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upcoming Detail & Media Modal */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-3xl my-auto bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[92vh]"
            >
              {/* Close Button */}
              <button
                id="close-coming-soon-modal"
                onClick={() => {
                  vibrate(30);
                  setSelectedItem(null);
                  setIsPlayingTrailer(false);
                  setTrailerUrl(null);
                  setTrailerNotFound(false);
                  setItemImages({ posters: [], backdrops: [] });
                  setTranslatedSynopsis(null);
                  setShowOriginalSynopsis(false);
                }}
                className="absolute top-3 right-3 z-40 w-9 h-9 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center border border-white/20 transition-all active:scale-95 shadow-xl"
              >
                <X className="w-4 h-4" />
              </button>

              {/* TOP MEDIA GALLERY: All posters in full size portrait format */}
              {allModalImages.length > 0 && (
                <div className="relative w-full bg-zinc-950 shrink-0 border-b border-zinc-200/80 dark:border-zinc-800/80 pt-3.5 pb-2.5 px-3.5 sm:pt-4 sm:pb-3 sm:px-4">
                  <div className="flex items-center justify-between mb-2 pr-12 rtl:pr-0 rtl:pl-12">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={clsx(
                        "text-[11px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5 py-0.5 leading-normal",
                        language === 'ur' ? 'urdu-font text-xs' : ''
                      )}>
                        <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('Media & Official Gallery')}</span>
                      </span>
                      <span className={clsx(
                        "px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-300 font-bold leading-normal",
                        language === 'ur' ? 'urdu-font text-[11px]' : ''
                      )}>
                        {allModalImages.length} {t('posters & images')}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-medium hidden sm:inline">
                      {t('Click any image to view fullscreen')}
                    </span>
                  </div>

                  {/* Gallery Carousel: All posters in full size portrait aspect ratio */}
                  <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar snap-x snap-mandatory">
                    {allModalImages.map((img, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          vibrate(20);
                          setIsLightboxImageLoading(true);
                          setFullscreenImageIndex(idx);
                        }}
                        className="group/img relative w-[130px] sm:w-[155px] md:w-[175px] aspect-[2/3] shrink-0 snap-start rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer border border-zinc-800 hover:border-amber-500/70 bg-zinc-900 shadow-md transition-all duration-300 transform-gpu hover:scale-[1.02]"
                      >
                        <img
                          src={getOptimizedImageUrl(img.url, 400)}
                          alt={`${selectedItem.title} ${img.label}`}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent opacity-60 group-hover/img:opacity-90 transition-opacity" />

                        {/* Single Unified Image Label Tag */}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/80 text-zinc-200 border border-white/15 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md shadow-md">
                          {img.type === 'poster' ? (
                            <Film className="w-3 h-3 text-amber-400 shrink-0" />
                          ) : (
                            <ImageIcon className="w-3 h-3 text-blue-400 shrink-0" />
                          )}
                          <span className="truncate max-w-[90px]">{img.label}</span>
                        </div>

                        {/* Fullscreen Overlay Button on Hover */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/40 backdrop-blur-[1px]">
                          <div className="px-2.5 py-1.5 rounded-xl bg-black/85 text-white border border-white/20 flex items-center gap-1.5 text-[11px] font-bold shadow-lg transform group-hover/img:scale-105 transition-transform">
                            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                            <span>{t('View HD')}</span>
                          </div>
                        </div>

                        {/* Bottom Right Expand Indicator */}
                        <div className="absolute bottom-2 right-2 p-1 rounded-md bg-black/60 backdrop-blur-md text-zinc-300 border border-white/10 opacity-75 group-hover/img:opacity-100 transition-opacity">
                          <Maximize2 className="w-3 h-3 text-amber-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Content Body */}
              <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar flex-1">
                {/* Badges Bar */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {/* Movie / Series badge */}
                  <span
                    className={clsx(
                      "px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider text-white shadow-md border border-white/20",
                      selectedItem.type === 'movie' ? 'bg-blue-600' : 'bg-purple-600'
                    )}
                  >
                    {selectedItem.type === 'movie' ? 'Movie' : 'Series'}
                  </span>

                  {/* OTT Date Badge */}
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    {selectedItem.hasOttDate && selectedItem.releaseDate
                      ? `OTT: ${formatReleaseDate(selectedItem.releaseDate)}`
                      : t('OTT Date TBA')}
                  </span>

                  {/* Actual OTT Platform Brand with AI Prediction Indicator */}
                  {selectedItem.ottPlatform ? (
                    (() => {
                      const badge = getOttBadgeConfig(selectedItem.ottPlatform);
                      return (
                        <span
                          className={clsx(
                            "px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider border shadow-md flex items-center gap-1.5",
                            badge ? badge.bg : 'bg-zinc-800 text-white border-zinc-700'
                          )}
                        >
                          <Tv2 className="w-3.5 h-3.5" />
                          <span>{badge ? badge.name : selectedItem.ottPlatform}</span>
                        </span>
                      );
                    })()
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                      <span>{t('Detecting OTT Platform...')}</span>
                    </span>
                  )}

                  {/* Star Rating Badge */}
                  {selectedItem.voteAverage > 0 && (
                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-yellow-500/10 text-yellow-500 dark:text-yellow-400 border border-yellow-500/20 flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                      {selectedItem.voteAverage.toFixed(1)} / 10
                    </span>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white leading-tight mb-1">
                  {selectedItem.title}
                </h2>

                {selectedItem.originalTitle && selectedItem.originalTitle !== selectedItem.title && (
                  <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 italic mb-3">
                    {selectedItem.originalTitle}
                  </p>
                )}

                {selectedItem.genres && selectedItem.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {selectedItem.genres.map((g) => (
                      <span
                        key={g}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                {/* Primary Actions: Watch Trailer, Share Title & TMDB Link */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 mb-5 pb-4 border-b border-zinc-200/80 dark:border-zinc-800/80">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      id="modal-watch-trailer-btn"
                      onClick={() => handlePlayTrailer(selectedItem)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>{t('Watch Trailer')}</span>
                    </button>

                    <button
                      id="share-coming-soon-btn"
                      onClick={(e) => handleShare(e, selectedItem)}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all active:scale-95 cursor-pointer"
                    >
                      {copiedLink ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="text-emerald-500">{t('Copied!')}</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4" />
                          <span>{t('Share Title')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Synopsis with AI Translation */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={clsx(
                      "font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5",
                      language === 'ur' ? 'urdu-font text-sm' : 'text-xs'
                    )}>
                      <span>{t('Synopsis')}</span>
                      {language !== 'en' && translatedSynopsis && !showOriginalSynopsis && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          {t('AI Translated')}
                        </span>
                      )}
                    </h4>

                    {/* Language Switch Toggle (Original vs Translated) */}
                    {language !== 'en' && selectedItem.overview && (
                      <button
                        type="button"
                        onClick={() => {
                          vibrate(20);
                          setShowOriginalSynopsis(!showOriginalSynopsis);
                        }}
                        className="flex items-center gap-1 text-[11px] font-bold text-amber-500 hover:text-amber-400 transition-colors"
                      >
                        <Languages className="w-3.5 h-3.5" />
                        <span>
                          {showOriginalSynopsis ? t('Show AI Translation') : t('Show Original')}
                        </span>
                      </button>
                    )}
                  </div>

                  {isTranslatingSynopsis && !translatedSynopsis ? (
                    <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 text-xs text-zinc-500">
                      <Sparkles className="w-4 h-4 text-amber-500 animate-spin" />
                      <span>{t('Translating synopsis to your selected language with AI...')}</span>
                    </div>
                  ) : (
                    <p
                      dir={language === 'ur' && !showOriginalSynopsis ? 'rtl' : 'ltr'}
                      className={clsx(
                        "p-3.5 sm:p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60",
                        language === 'ur' && !showOriginalSynopsis
                          ? 'urdu-font text-lg sm:text-xl leading-[2.2] sm:leading-[2.4] font-medium text-zinc-800 dark:text-zinc-100 text-right'
                          : 'text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 font-normal'
                      )}
                    >
                      {showOriginalSynopsis
                        ? selectedItem.overview
                        : (translatedSynopsis || selectedItem.overview || t('No overview available for this upcoming title.'))}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FULLSCREEN TRAILER PLAYER MODAL */}
      <AnimatePresence>
        {isPlayingTrailer && selectedItem && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-xl p-3 sm:p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-5xl aspect-video bg-zinc-950 rounded-2xl sm:rounded-3xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Header Bar */}
              <div className="absolute top-3 left-3 right-3 z-50 flex items-center justify-between text-white pointer-events-auto">
                <div className="flex items-center gap-2 bg-black/75 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20">
                  <Film className="w-4 h-4 text-amber-400" />
                  <span className="text-xs sm:text-sm font-bold truncate max-w-[200px] sm:max-w-md">
                    {selectedItem.title} • {t('Official Trailer')}
                  </span>
                </div>

                <button
                  id="close-fullscreen-trailer-btn"
                  onClick={() => {
                    vibrate(20);
                    setIsPlayingTrailer(false);
                  }}
                  className="w-10 h-10 rounded-full bg-black/75 hover:bg-black text-white flex items-center justify-center border border-white/20 transition-all active:scale-95 shadow-xl"
                  title={t('Close Trailer')}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Video Player or Loading State */}
              <div className="w-full h-full flex items-center justify-center bg-zinc-950">
                {loadingTrailer ? (
                  <div className="flex flex-col items-center gap-3 text-white">
                    <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-bold">{t('Loading Official Trailer...')}</span>
                  </div>
                ) : trailerUrl ? (
                  <iframe
                    src={getYouTubeEmbedUrl(trailerUrl) || ''}
                    title={`${selectedItem.title} Official Trailer`}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : trailerNotFound ? (
                  <div className="flex flex-col items-center gap-3 text-center p-6">
                    <Film className="w-12 h-12 text-zinc-600 mb-1" />
                    <p className="text-sm sm:text-base font-bold text-zinc-300">
                      {t('Direct trailer embed not found on TMDB.')}
                    </p>
                    <a
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(selectedItem.title + ' ' + (selectedItem.type === 'movie' ? 'Movie' : 'Series') + ' official trailer')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold flex items-center gap-2 transition-all active:scale-95 shadow-xl"
                    >
                      <Search className="w-4 h-4" />
                      <span>{t('Search & Watch on YouTube')}</span>
                    </a>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-white">
                    <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FULLSCREEN LIGHTBOX VIEWER FOR ALL GALLERY IMAGES WITH LOADING SPINNER */}
      <AnimatePresence>
        {fullscreenImageIndex !== null && allModalImages[fullscreenImageIndex] && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-lg p-2 sm:p-6 select-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="relative w-full h-full flex flex-col items-center justify-center"
            >
              {/* Header Bar */}
              <div className="absolute top-3 left-3 right-3 z-50 flex items-center justify-between text-white">
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20">
                  <span className="text-xs font-bold">
                    {selectedItem?.title} • {allModalImages[fullscreenImageIndex].label}
                  </span>
                  <span className="text-xs text-zinc-400">
                    ({fullscreenImageIndex + 1} / {allModalImages.length})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      vibrate(20);
                      setFullscreenImageIndex(null);
                    }}
                    className="w-10 h-10 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center border border-white/20 transition-all active:scale-95 cursor-pointer"
                    title={t('Close Fullscreen')}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Main Fullscreen Image with Loading Spinner */}
              <div className="relative max-w-full max-h-[85vh] flex items-center justify-center overflow-hidden p-2">
                {isLightboxImageLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/40 backdrop-blur-sm rounded-xl">
                    <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mb-2" />
                    <span className="text-xs font-bold text-white tracking-wide">
                      {t('Loading Image...')}
                    </span>
                  </div>
                )}
                <img
                  src={allModalImages[fullscreenImageIndex].url}
                  alt={`${selectedItem?.title} Fullscreen ${fullscreenImageIndex + 1}`}
                  onLoad={() => setIsLightboxImageLoading(false)}
                  onError={() => setIsLightboxImageLoading(false)}
                  className={clsx(
                    "max-w-full max-h-[82vh] object-contain rounded-xl sm:rounded-2xl shadow-2xl transition-opacity duration-300",
                    isLightboxImageLoading ? "opacity-30" : "opacity-100"
                  )}
                />
              </div>

              {/* Previous / Next Buttons */}
              {allModalImages.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      vibrate(20);
                      setIsLightboxImageLoading(true);
                      setFullscreenImageIndex((prev) =>
                        prev === null ? 0 : (prev - 1 + allModalImages.length) % allModalImages.length
                      );
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-black/70 hover:bg-amber-500 hover:text-black text-white border border-white/20 flex items-center justify-center transition-all active:scale-95 shadow-xl cursor-pointer"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      vibrate(20);
                      setIsLightboxImageLoading(true);
                      setFullscreenImageIndex((prev) =>
                        prev === null ? 0 : (prev + 1) % allModalImages.length
                      );
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-black/70 hover:bg-amber-500 hover:text-black text-white border border-white/20 flex items-center justify-center transition-all active:scale-95 shadow-xl cursor-pointer"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}

              {/* Bottom Thumbnail Strip */}
              {allModalImages.length > 1 && (
                <div
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[90vw] overflow-x-auto p-1.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/15 flex gap-2 hide-scrollbar"
                  onClick={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                >
                  {allModalImages.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (i !== fullscreenImageIndex) {
                          vibrate(20);
                          setIsLightboxImageLoading(true);
                          setFullscreenImageIndex(i);
                        }
                      }}
                      className={clsx(
                        "w-10 h-14 sm:w-12 sm:h-16 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer",
                        i === fullscreenImageIndex
                          ? "border-amber-400 dark:border-amber-400 scale-110 shadow-lg shadow-amber-500/30 opacity-100"
                          : "border-zinc-500 dark:border-zinc-500 opacity-80 hover:opacity-100 hover:border-zinc-300"
                      )}
                    >
                      <img src={getOptimizedImageUrl(img.url, 100)} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Share Preview Modal */}
      <SharePreviewModal
        isOpen={shareModalData.isOpen}
        onClose={() => setShareModalData((prev) => ({ ...prev, isOpen: false }))}
        title="Share Content"
        contentTitle={shareModalData.contentTitle}
        posterUrl={shareModalData.posterUrl}
        shareText={shareModalData.shareText}
        shareSubject={shareModalData.shareSubject}
      />
    </div>
  );
};

export default ComingSoonSection;
