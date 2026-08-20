import { standardizePhone } from "../../contexts/AuthContext";
import { fetchReviewsFromChunks } from "../../utils/chunkUtils";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  useParams,
  Link,
  useNavigate,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import { Helmet } from "react-helmet-async";

import { AdBanner } from "../../components/AdBanner";
import { GuestAccessBanner } from "../../components/GuestAccessBanner";
import { Content, QualityLinks, Season, Trailer } from "../../types";
import { Translate } from "../../components/Translate";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useContent } from "../../contexts/ContentContext";
import { useCart } from "../../contexts/CartContext";
import { useHaptics } from "../../hooks/useHaptics";
import { globalScrollState } from "../../hooks/useScrollRestoration";
import { safeStorage } from "../../utils/safeStorage";
import {
  Film,
  Phone,
  MessageSquare,
  ArrowLeft,
  Play,
  Clock,
  Heart,
  MessageCircle,
  AlertCircle,
  Download,
  Share2,
  Chrome,
  Copy,
  Youtube,
  X,
  Edit2,
  Trash2,
  Settings,
  Lock,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Search,
  AlertTriangle,
  Globe,
  ShoppingCart,
  RefreshCw,
  ExternalLink,
  Send,
  Gift,
  Maximize2,
  Image as ImageIcon,
  Volume2,
  VolumeX,
} from "lucide-react";
import { logEvent } from "../../services/analytics";
import { touchMetadataUsage } from "../../services/cacheManager";
import AlertModal from "../../components/AlertModal";
import ConfirmModal from "../../components/ConfirmModal";
import SharePreviewModal from "../../components/SharePreviewModal";
import { clsx } from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import {
  formatContentTitle,
  formatReleaseDate,
  formatRuntime,
  getContrastColor,
  isRomanized,
  getOttBadgeConfig,
} from "../../utils/contentUtils";
import { OttBadge } from "../../components/OttBadge";
import {
  MediaModal,
  findTMDBByImdb,
  searchTMDBByTitle,
  fetchTMDBDetails,
  getBestAlternativeTitle,
  fetchIMDbRating,
  fetchKinoCheckTrailer,
  getBestTrailer,
  searchYouTubeTrailer,
  fetchSeriesSeasons,
} from "../../components/MediaModal";
import {
  saveImdbRatingToStorage,
  getCachedImdbRating,
  reloadLiveImdbRating
} from "../../services/imdbRatingService";
import { useImdbRating } from "../../hooks/useImdbRating";
import {
  fetchTMDBImages,
  extractOttPlatformFromTMDBDetails,
  fetchMovieDigitalReleaseDate,
  predictOttPlatformWithAI
} from "../../services/tmdb";
import ContentCard from "../../components/ContentCard";

import { useModalBehavior } from "../../hooks/useModalBehavior";
import Modal from "../../components/Modal";
import { useSettings } from "../../contexts/SettingsContext";

import { ContactSupportButtons } from "../../components/ContactSupportButtons";
import { PageTransition } from "../../components/PageTransition";

export default function MovieDetails() {
  const { id } = useParams<{ id: string }>();

  if (id && /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(id)) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <img
          src={`/${id}`}
          alt={id}
          className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
        />
        <a
          href={`/${id}`}
          download
          className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors"
        >
          View / Download Image
        </a>
      </div>
    );
  }

  const { vibrate } = useHaptics();
  const {
    profile,
    loading: profileLoading,
    toggleFavorite: authToggleFavorite,
    toggleWatchLater: authToggleWatchLater,
    updateUserProfileData,
    refreshProfile,
    isSyncing,
  } = useAuth();
  const { t, language, translateMany } = useLanguage();
  const {
    contentList,
    genres,
    languages,
    qualities,
    loading: contentLoading,
    isOffline,
    getContent,
    updateContentFields,
    deleteContent,
    checkForUpdates,
  } = useContent();
  const { cart, addToCart } = useCart();
  const { settings, refreshSettings } = useSettings();
  const [hasAttemptedGlobalRefresh, setHasAttemptedGlobalRefresh] =
    useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const content = useMemo(() => {
    return contentList.find((c) => c.id === id) || null;
  }, [contentList, id]);

  const [loading, setLoading] = useState(() => {
    const found = contentList.find((c) => c.id === id);
    return !found;
  });
  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: "", message: "" });


  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isWatchLaterLoading, setIsWatchLaterLoading] = useState(false);
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [resolvingTgId, setResolvingTgId] = useState<string | null>(null);
  const [telegramConfirmModal, setTelegramConfirmModal] = useState<{
    isOpen: boolean;
    url: string;
    id: string;
  } | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [linkPopup, setLinkPopup] = useState<{
    isOpen: boolean;
    url: string;
    originalUrl?: string;
    name: string;
    id: string;
    isZip?: boolean;
    tinyUrl?: string;
    candidates?: { text: string; href: string }[];
    size?: string;
    isCloudflare?: boolean;
    formattedTitle?: string;
  } | null>(null);
  const [isPosterExpanded, setIsPosterExpanded] = useState(false);
  const [isPosterHintDismissed, setIsPosterHintDismissed] = useState(false);
  const [tmdbGalleryImages, setTmdbGalleryImages] = useState<{ posters: string[]; backdrops: string[] }>({ posters: [], backdrops: [] });
  const [loadingTmdbGallery, setLoadingTmdbGallery] = useState(false);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [isLightboxImageLoading, setIsLightboxImageLoading] = useState(true);
  const [isTrailerPopupOpen, setIsTrailerPopupOpen] = useState(false);
  const [isTrailerSelectionOpen, setIsTrailerSelectionOpen] = useState(false);
  const [showRatePrompt, setShowRatePrompt] = useState(false);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const [hasUserRated, setHasUserRated] = useState<boolean>(() => safeStorage.getItem('has_rated') === 'true' || !!profile?.reviewRewardClaimed);
  const recommendedScrollRef = useRef<HTMLDivElement>(null);

  const [adState, setAdState] = useState<{
    isPlaying: boolean;
    timeLeft: number;
    canSkip: boolean;
    isMuted: boolean;
    hasCompleted: boolean;
  } | null>(null);

  useEffect(() => {
    let timer: any;
    if (adState && adState.isPlaying && adState.timeLeft > 0) {
      timer = setTimeout(() => {
        setAdState((prev) => {
          if (!prev) return null;
          const nextTime = prev.timeLeft - 1;
          return {
            ...prev,
            timeLeft: nextTime,
            canSkip: nextTime <= 0,
          };
        });
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [adState]);

  useEffect(() => {
    if (linkPopup?.isOpen) {
      const isBasicUser = profile?.role === "basic" || profile?.role === "trial" || !profile;
      const provider = settings?.adProvider || 'both';
      const isAdsActive = settings && provider !== "disabled" && provider !== "google_adsense";
      
      if (isBasicUser && isAdsActive) {
        setAdState({
          isPlaying: true,
          timeLeft: settings?.adSkipTimer ?? 5,
          canSkip: false,
          isMuted: false,
          hasCompleted: false,
        });
      } else {
        setAdState({
          isPlaying: false,
          timeLeft: 0,
          canSkip: true,
          isMuted: false,
          hasCompleted: true,
        });
      }
    } else {
      setAdState(null);
    }
  }, [linkPopup?.isOpen, profile?.role, settings?.adProvider, settings?.adSkipTimer]);

  const scrollRecommended = (direction: 'left' | 'right') => {
    if (recommendedScrollRef.current) {
      const scrollAmount = direction === 'left' ? -350 : 350;
      recommendedScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (safeStorage.getItem('has_rated') === 'true' || profile?.reviewRewardClaimed) {
      setHasUserRated(true);
      return;
    }
    if (!profile?.uid && !profile?.email) return;

    fetchReviewsFromChunks(false).then((data) => {
      if (data && data.some((r: any) => 
        (profile?.uid && r.userId === profile.uid) || 
        (profile?.email && r.userEmail === profile.email) ||
        (profile?.displayName && r.userName === profile.displayName)
      )) {
        safeStorage.setItem('has_rated', 'true');
        setHasUserRated(true);
      }
    }).catch(() => {});
  }, [profile?.uid, profile?.email, profile?.displayName, profile?.reviewRewardClaimed]);
  const [sharePreviewModal, setSharePreviewModal] = useState<{
    isOpen: boolean;
    text: string;
    title: string;
    contentTitle?: string;
    posterUrl?: string | null;
    shareSubject?: string;
  }>({ isOpen: false, text: "", title: "" });
  const [activeTrailerUrl, setActiveTrailerUrl] = useState<string | null>(null);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [lockedContentInfo, setLockedContentInfo] = useState<{
    id: string;
    type: "movie" | "season";
    seasonId?: string;
    seasonNumber?: number;
    title: string;
    price: number;
  } | null>(null);
  const [expandedEpisodes, setExpandedEpisodes] = useState<
    Record<string, boolean>
  >({});
  const [cachedMetadata, setCachedMetadata] = useState<{
    id: string;
    data: Partial<Content>;
  }>(() => ({ id: "", data: {} }));

  const [isReporting, setIsReporting] = useState(false);
  const [liveRating, setLiveRating] = useState<string | null>(null);
  const [fetchingImdb, setFetchingImdb] = useState(false);
  const [extractingLinkId, setExtractingLinkId] = useState<string | null>(null);

  useModalBehavior(alertConfig.isOpen, () =>
    setAlertConfig((prev) => ({ ...prev, isOpen: false })),
  );
  useModalBehavior(showLoginPrompt, () => setShowLoginPrompt(false));
  useModalBehavior(isTrailerPopupOpen, () => {
    setIsTrailerPopupOpen(false);
    setActiveTrailerUrl(null);
  });
  useModalBehavior(isTrailerSelectionOpen, () =>
    setIsTrailerSelectionOpen(false),
  );
  useModalBehavior(sharePreviewModal.isOpen, () =>
    setSharePreviewModal({ ...sharePreviewModal, isOpen: false }),
  );
  useModalBehavior(linkPopup?.isOpen || false, () => setLinkPopup(null));
  useModalBehavior(!!deleteId, () => setDeleteId(null));
  useModalBehavior(isMediaModalOpen, () => setIsMediaModalOpen(false));
  useModalBehavior(isPosterExpanded, () => setIsPosterExpanded(false));

  const hasLoggedView = useRef(false);
  const navigate = useNavigate();
  const handleFilterNavigation = (key: string, value: string) => {
    const keys = ['home_search', 'home_sort', 'home_genre', 'home_language', 'home_type', 'home_quality', 'home_year', 'home_page'];
    keys.forEach(k => sessionStorage.removeItem(k));
    sessionStorage.setItem(key, value);
    globalScrollState.set("home_window_scroll", 0);
    navigate("/");
  };
  const location = useLocation();
  const navigationType = useNavigationType();

  // Scroll to top on mount or ID change, but only if it's a new navigation (PUSH/REPLACE)
  // If it's a POP navigation (back button), we want to preserve the scroll position
  useEffect(() => {
    if (navigationType !== "POP") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [id, navigationType]);

  const [fullContent, setFullContent] = useState<Content | null>(() => {
    if (id) {
      const cached = safeStorage.getItem(`movie_details_${id}`);
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
  const hubcloudCacheRef = useRef<
    Record<
      string,
      {
        url: string;
        candidates?: { text: string; href: string }[];
        size?: string;
        timestamp: number;
        isCloudflare?: boolean;
      }
    >
  >({});

  // Reset state and load cache on ID change
  useEffect(() => {
    let activeId = id;
    const foundInList = contentList.some((c) => c.id === id);
    if (!foundInList) setLoading(true);

    // Clear state synchronously for new ID
    setFullContent(null);
    setCachedMetadata({ id: id || "", data: {} });
    setTmdbGalleryImages({ posters: [], backdrops: [] });
    setActiveGalleryIndex(0);
    setLoadingTmdbGallery(false);
    setIsPosterExpanded(false);
    setIsLightboxImageLoading(true);

    if (id) {
      touchMetadataUsage(id);
      // Load full content cache asynchronously
      safeStorage.getItemAsync(`movie_details_${id}`).then((cachedFull) => {
        if (activeId !== id) return; // Prevent state updates from stale closures
        if (cachedFull) {
          try {
            const parsed = JSON.parse(cachedFull);
            if (parsed.id === id) {
              setFullContent(prev => prev?.id === id ? prev : parsed);
            }
          } catch (e) {
            // Ignore parse errors, let fetchFullContent handle fetching
          }
        }
      });

      // Load metadata cache
      const cachedMeta = safeStorage.getItem(`content_cache_${id}`);
      if (cachedMeta && activeId === id) {
        try {
          setCachedMetadata({ id: id, data: JSON.parse(cachedMeta) });
        } catch (e) {
          // ignore
        }
      }
    } else {
      setFullContent(null);
      setCachedMetadata({ id: "", data: {} });
    }
    setLiveRating(null);
    setFetchFailed(false);
    setFetchingImdb(false);
    setHasAttemptedGlobalRefresh(false);
    hasLoggedView.current = false;
    hasAttemptedRatingFetch.current = {};
    hasAttemptedStaticFetch.current = {};
    hasAttemptedEpisodeFetch.current = {};

    return () => { activeId = null; };
  }, [id]);

  const [recentlyViewed, setRecentlyViewed] = useState<Content[]>([]);

  useEffect(() => {
    try {
      const recentStr = safeStorage.getItem("recently_viewed");
      if (recentStr) {
        setRecentlyViewed(JSON.parse(recentStr));
      }
    } catch (e) {
      console.error("Failed to load recently viewed", e);
    }
  }, []);

  const isMinimal = useMemo(() => {
    const target = (fullContent?.id === id && fullContent) ? fullContent : content;
    if (!target) return true;
    let parsedSeasons: any[] = [];
    try {
      parsedSeasons =
        target.type === "series" && target.seasons
          ? Array.isArray(target.seasons)
            ? target.seasons
            : JSON.parse(target.seasons as string)
          : [];
    } catch (e) {}
    const hasFullSeasons =
      target.type === "series" &&
      parsedSeasons.length > 0 &&
      parsedSeasons.some((s: any) => s.episodes && s.episodes.length > 1);
    return (
      (target.type === "movie" && !target.movieLinks) ||
      (target.type === "series" && !hasFullSeasons)
    );
  }, [content, fullContent, id]);

  const isStale = useMemo(() => {
    if (!content || !fullContent) return false;
    // Compare updatedAt strings or timestamps to detect changes from the search index (contentList)
    const getUpdateStr = (t: any) => {
      if (!t) return "none";
      if (typeof t === "object" && t.seconds) return t.seconds.toString();
      if (typeof t === "string" || typeof t === "number") return t.toString();
      return JSON.stringify(t);
    };
    return (
      getUpdateStr(content.updatedAt) !== getUpdateStr(fullContent.updatedAt)
    );
  }, [content, fullContent]);

  useEffect(() => {
    if (
      (isMinimal || isStale) &&
      !contentLoading &&
      id &&
      !fetchFailed &&
      !isOffline &&
      !hasFetchedFull.current[id]
    ) {
      hasFetchedFull.current[id] = true;
      const fetchFullContent = async () => {
        try {
          if (content && (content as any).chunkId) {
            const { safeStorage } = await import("../../utils/safeStorage");
            const { expandContent } = await import("../../utils/chunkUtils");
            const chunkStr = safeStorage.getItem(
              "content_chunk_" + (content as any).chunkId,
            );
            if (chunkStr) {
              const items = JSON.parse(chunkStr);
              if (items[id]) {
                const expanded = expandContent(
                  { ...items[id], id },
                  (content as any).chunkId,
                );
                expanded.order = content.order;
                setFullContent(expanded);
                setLoading(false);
                safeStorage.setItemAsync(
                  `movie_details_${id}`,
                  JSON.stringify(expanded),
                );
                return; // STOP! Don't fetch from Firestore
              }
            }
          }

          const data = await getContent(id);
          if (data) {
            setFullContent(data);
            setLoading(false);
            safeStorage.setItemAsync(
              `movie_details_${id}`,
              JSON.stringify(data),
            );
          } else {
            setFetchFailed(true);
            setLoading(false);
            setFullContent(null);
            safeStorage.removeItemAsync(`movie_details_${id}`);
            safeStorage.removeItemAsync(`content_cache_${id}`);
          }
        } catch (e) {
          console.error("Failed to fetch full content", e);
          setFetchFailed(true);
          setLoading(false);
        }
      };
      fetchFullContent();
    }
  }, [isMinimal, isStale, id, fetchFailed, isOffline, content, contentLoading]);

  const mergedContent = useMemo(() => {
    // If it's completely missing from contentList and we've finished loading contentList, it doesn't exist anymore
    if (!content && !contentLoading && !isOffline) return null;

    if (!content && !fullContent) return null;
    // Prioritize cachedMetadata (TMDB updates/local edits), then fresh fullContent from DB, then partial content from list
    const metadata: any = cachedMetadata.id === id ? cachedMetadata.data : {};
    const validFullContent: any = fullContent?.id === id ? fullContent : {};

    const merged: any = {
      ...(content || {}),
      ...validFullContent,
      ...metadata,
    };

    // Rescue links from validFullContent if metadata incorrectly overwrote them
    if (metadata.seasons && validFullContent.seasons) {
      try {
        const metaSeasons =
          typeof metadata.seasons === "string"
            ? JSON.parse(metadata.seasons)
            : metadata.seasons;
        const fullSeasons =
          typeof validFullContent.seasons === "string"
            ? JSON.parse(validFullContent.seasons)
            : validFullContent.seasons;

        const rescuedSeasons = fullSeasons.map((fs: any) => {
          const ms = metaSeasons.find(
            (m: any) => m.seasonNumber === fs.seasonNumber,
          );
          if (!ms) return fs;
          const rescued = {
            ...fs,
            year: ms.year || fs.year,
            title: ms.title || fs.title,
          };
          if (fs.episodes && ms.episodes) {
            rescued.episodes = fs.episodes.map((fe: any) => {
              const me = ms.episodes.find(
                (m: any) => m.episodeNumber === fe.episodeNumber,
              );
              if (!me) return fe;
              const isFeDescPlaceholder = !fe.description || /^episode/i.test(fe.description);
              const isFeDurPlaceholder = !fe.duration || fe.duration === "N/A";

              return {
                ...fe,
                title: me.title || fe.title,
                description: (isFeDescPlaceholder && me.description) ? me.description : (me.description || fe.description),
                duration: (isFeDurPlaceholder && me.duration) ? me.duration : (me.duration || fe.duration),
              };
            });
          }
          return rescued;
        });
        merged.seasons = JSON.stringify(rescuedSeasons);
      } catch (e) {
        console.error("Error rescuing seasons links:", e);
      }
    }

    return merged as Content;
  }, [content, cachedMetadata, fullContent, id, contentLoading, isOffline]);

  const { rating: hookRating, ottPlatform: hookOtt } = useImdbRating(mergedContent);

  const loadTmdbImagesForGallery = async () => {
    if (!mergedContent || loadingTmdbGallery) {
      return;
    }
    const currentId = mergedContent.id;
    setLoadingTmdbGallery(true);
    try {
      let tmdbId = "";
      let tmdbType = mergedContent.type === "series" ? "tv" : "movie";
      const imdbId = mergedContent.imdbLink?.match(/tt\d+/)?.[0] || "";

      if (imdbId) {
        const found = await findTMDBByImdb(imdbId, tmdbType);
        if (found) {
          tmdbId = found.item.id;
          tmdbType = found.type;
        }
      }

      if (!tmdbId && mergedContent.title) {
        const results = await searchTMDBByTitle(
          mergedContent.title,
          mergedContent.year?.toString() || "",
          tmdbType
        );
        if (results && results.length > 0) {
          tmdbId = results[0].item.id;
          tmdbType = results[0].type;
        }
      }

      if (tmdbId) {
        const imgs = await fetchTMDBImages(Number(tmdbId), tmdbType as any);
        if (currentId === id) {
          setTmdbGalleryImages(imgs);
        }
      }
    } catch (e) {
      console.error("Error loading gallery images from TMDB:", e);
    } finally {
      if (currentId === id) {
        setLoadingTmdbGallery(false);
      }
    }
  };

  const allGalleryImages = useMemo(() => {
    const list: { url: string; type: 'poster' | 'backdrop'; label: string }[] = [];
    const mainPoster = mergedContent?.posterUrl || settings?.defaultAppImage || 'https://picsum.photos/seed/movie/400/600';
    if (mainPoster) {
      list.push({ url: mainPoster, type: 'poster', label: 'Main Poster' });
    }
    tmdbGalleryImages.posters.forEach((p) => {
      if (!list.some((item) => item.url === p)) {
        const count = list.filter((i) => i.type === 'poster').length;
        list.push({ url: p, type: 'poster', label: `Poster ${count + 1}` });
      }
    });
    tmdbGalleryImages.backdrops.forEach((b) => {
      if (!list.some((item) => item.url === b)) {
        const count = list.filter((i) => i.type === 'backdrop').length;
        list.push({ url: b, type: 'backdrop', label: `Backdrop ${count + 1}` });
      }
    });
    return list;
  }, [mergedContent?.posterUrl, settings?.defaultAppImage, tmdbGalleryImages]);

  const handleOpenPosterLightbox = () => {
    setActiveGalleryIndex(0);
    setIsLightboxImageLoading(true);
    setIsPosterExpanded(true);
    loadTmdbImagesForGallery();
  };

  const handlePrevGalleryImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (allGalleryImages.length <= 1) return;
    setIsLightboxImageLoading(true);
    setActiveGalleryIndex((prev) => (prev === 0 ? allGalleryImages.length - 1 : prev - 1));
  };

  const handleNextGalleryImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (allGalleryImages.length <= 1) return;
    setIsLightboxImageLoading(true);
    setActiveGalleryIndex((prev) => (prev === allGalleryImages.length - 1 ? 0 : prev + 1));
  };

  // Touch swipe handlers for lightbox
  const lightboxTouchStartX = useRef<number | null>(null);
  const lightboxTouchEndX = useRef<number | null>(null);

  const handleLightboxTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.no-scrollbar, .overflow-x-auto, button')) {
      lightboxTouchStartX.current = null;
      lightboxTouchEndX.current = null;
      return;
    }
    lightboxTouchEndX.current = null;
    lightboxTouchStartX.current = e.touches[0].clientX;
  };

  const handleLightboxTouchMove = (e: React.TouchEvent) => {
    lightboxTouchEndX.current = e.touches[0].clientX;
  };

  const handleLightboxTouchEnd = () => {
    if (lightboxTouchStartX.current === null || lightboxTouchEndX.current === null) return;
    const distance = lightboxTouchStartX.current - lightboxTouchEndX.current;
    const minSwipeDistance = 40;

    if (distance > minSwipeDistance) {
      // Swiped Left -> Next Image
      handleNextGalleryImage();
    } else if (distance < -minSwipeDistance) {
      // Swiped Right -> Previous Image
      handlePrevGalleryImage();
    }
    lightboxTouchStartX.current = null;
    lightboxTouchEndX.current = null;
  };

  useEffect(() => {
    if (!isPosterExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrevGalleryImage();
      if (e.key === "ArrowRight") handleNextGalleryImage();
      if (e.key === "Escape") setIsPosterExpanded(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPosterExpanded, allGalleryImages.length]);

  const seasons = useMemo(() => {
    if (
      !mergedContent ||
      mergedContent.type !== "series" ||
      !mergedContent.seasons
    )
      return [] as Season[];
    try {
      const sData = mergedContent.seasons;
      return (
        Array.isArray(sData) ? sData : JSON.parse(sData || "[]")
      ) as Season[];
    } catch (e) {
      console.error("Error parsing seasons:", e);
      return [] as Season[];
    }
  }, [mergedContent]);

  const hasPrefetched = useRef<Set<string>>(new Set());

  // Prefetch translations for all content in one go
  useEffect(() => {
    if (language === 'en' || !mergedContent || isOffline) return;
    
    // For series, wait until seasons are loaded to translate everything in one batch
    if (mergedContent.type === 'series' && seasons.length === 0) return;

    const prefetchKey = `all_pref_${id}_${language}_${seasons.length}`;
    if (hasPrefetched.current.has(prefetchKey)) return;
    
    const stringsToTranslate = new Set<string>();
    
    if (mergedContent.description) stringsToTranslate.add(mergedContent.description);
    
    if (mergedContent.type === 'series') {
      seasons.forEach(season => {
        if (season.title) stringsToTranslate.add(season.title);
        if (season.episodes) {
          season.episodes.forEach(ep => {
            if (ep.title && !/^episode\s+\d+$/i.test(ep.title.trim())) {
              stringsToTranslate.add(ep.title);
            }
            // Removed episode description from prefetch to translate on open only
          });
        }
      });
    }
    
    if (stringsToTranslate.size > 0) {
      hasPrefetched.current.add(prefetchKey);
      translateMany(Array.from(stringsToTranslate));
    }
  }, [mergedContent, language, seasons, id, translateMany, isOffline]);

  const allTrailers = useMemo(() => {
    const list: Trailer[] = [];
    if (mergedContent?.trailerUrl) {
      list.push({
        id: "main",
        url: mergedContent.trailerUrl,
        title: mergedContent.trailerTitle || "",
        youtubeTitle: mergedContent.trailerYoutubeTitle,
        seasonNumber: mergedContent.trailerSeasonNumber,
      });
    }
    if (mergedContent?.trailers) {
      try {
        const additional = (
          Array.isArray(mergedContent.trailers)
            ? mergedContent.trailers
            : JSON.parse(mergedContent.trailers || "[]")
        ) as Trailer[];
        list.push(...additional);
      } catch (e) {}
    }
    // Also include season trailers if not already in the list
    seasons.forEach((s) => {
      if (s.trailerUrl && !list.some((t) => t.url === s.trailerUrl)) {
        list.push({
          id: `season-${s.seasonNumber}`,
          url: s.trailerUrl,
          title: "",
          seasonNumber: s.seasonNumber,
        });
      }
    });
    return list;
  }, [mergedContent, seasons]);

  const title = mergedContent
    ? `${formatContentTitle(mergedContent)} (${mergedContent.year}) - ${settings?.headerText || "MovizNow"}`
    : `${settings?.headerText || "MovizNow"} - ${t("Movie Details")}`;
  const description =
    mergedContent?.description ||
    `Watch the latest movies and series on ${settings?.headerText || "MovizNow"}.`;
  const imageUrl =
    mergedContent?.posterUrl ||
    settings?.defaultAppImage ||
    "https://Moviz-Now.vercel.app/logo.svg";
  const pageUrl = window.location.href;

  const displayData = useMemo(() => {
    if (!mergedContent) return null;

    // Helper to handle cast which could be string or array
    const getCastArray = () => {
      const cast = mergedContent.cast as any;
      if (Array.isArray(cast)) return cast;
      if (typeof cast === "string")
        return cast
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      return [];
    };

    const castArray = getCastArray();

    const getGenresString = () => {
      // 1. Try to map genreIds to names
      if (mergedContent.genreIds && Array.isArray(mergedContent.genreIds)) {
        const names = genres
          .filter((g) => mergedContent.genreIds?.includes(g.id))
          .map((g) => g.name);
        if (names.length > 0) return names.join(", ");
      }
      // 2. Fallback to genres property if it's an array of names
      if (
        (mergedContent as any).genres &&
        Array.isArray((mergedContent as any).genres)
      ) {
        return (mergedContent as any).genres.join(", ");
      }
      return "";
    };

    const getLanguageString = () => {
      if (
        mergedContent.languageIds &&
        Array.isArray(mergedContent.languageIds)
      ) {
        const names = languages
          .filter((l) => mergedContent.languageIds?.includes(l.id))
          .map((l) => l.name);
        if (names.length > 0) return names.join(", ");
      }
      if (
        (mergedContent as any).language &&
        typeof (mergedContent as any).language === "string"
      ) {
        return (mergedContent as any).language;
      }
      return "";
    };

    const getQualityString = () => {
      if (mergedContent.qualityId) {
        const matchingQuality = qualities.find(
          (q) => q.id === mergedContent.qualityId,
        );
        if (matchingQuality) return matchingQuality.name;
      }
      if (
        (mergedContent as any).quality &&
        typeof (mergedContent as any).quality === "string"
      ) {
        return (mergedContent as any).quality;
      }
      return "";
    };

    return {
      title: mergedContent.title,
      year: mergedContent.year,
      description: mergedContent.description,
      cast: castArray.join(", "),
      castArray: castArray,
      posterUrl: mergedContent.posterUrl,
      genres: getGenresString(),
      language: getLanguageString(),
      quality: getQualityString(),
      releaseDate: mergedContent.releaseDate,
      duration: mergedContent.runtime,
      country: mergedContent.country,
      type: mergedContent.type,
      rating: liveRating || hookRating || mergedContent.imdbRating,
      ottPlatform: hookOtt || mergedContent.ottPlatform || (mergedContent as any).ott_platform || "",
      isFetched: !!(liveRating || hookRating || mergedContent.imdbRating),
    };
  }, [mergedContent, genres, liveRating, hookRating, hookOtt]);

  const recommendedMovies = useMemo(() => {
    if (!mergedContent || contentList.length === 0) return [];

    const currentId = mergedContent.id;
    const currentGenres = mergedContent.genreIds || [];
    const currentLangs = mergedContent.languageIds || [];

    const scored = contentList
      .filter((c) => c.id !== currentId && c.status === "published")
      .map((c) => {
        let score = 0;

        if (c.genreIds) {
          const commonGenres = c.genreIds.filter((g) =>
            currentGenres.includes(g),
          );
          score += commonGenres.length * 2;
        }

        if (c.languageIds) {
          const commonLangs = c.languageIds.filter((l) =>
            currentLangs.includes(l),
          );
          score += commonLangs.length * 1;
        }

        recentlyViewed.forEach((rv) => {
          if (rv.id !== c.id) {
            if (c.genreIds && rv.genreIds) {
              const common = c.genreIds.filter((g) => rv.genreIds?.includes(g));
              score += common.length * 0.5;
            }
          }
        });

        return { content: c, score };
      });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.content.createdAt
        ? new Date(a.content.createdAt).getTime()
        : 0;
      const bTime = b.content.createdAt
        ? new Date(b.content.createdAt).getTime()
        : 0;
      return bTime - aTime;
    });

    return scored
      .slice(0, settings?.recommendedLimit || 10)
      .map((s) => s.content);
  }, [mergedContent, contentList, recentlyViewed, settings?.recommendedLimit]);

  useEffect(() => {
    if (!contentLoading) {
      // If we have at least the basic content from the list, stop loading
      // This allows the page to show metadata while links fetch in background
      if (content) {
        setLoading(false);
      }
      // If not in list, wait for the full fetch to complete or fail
      else if (
        (fullContent && fullContent.id === id) ||
        fetchFailed ||
        isOffline
      ) {
        setLoading(false);
      }

      if (mergedContent && !hasLoggedView.current && profile?.uid) {
        hasLoggedView.current = true;
        logEvent("content_click", profile.uid, {
          contentId: mergedContent.id,
          contentTitle: mergedContent.title,
        });

        // Add to recently viewed
        try {
          const recentStr = safeStorage.getItem("recently_viewed");
          let recent: Content[] = recentStr ? JSON.parse(recentStr) : [];
          // Remove if already exists
          recent = recent.filter((c) => c.id !== mergedContent.id);

          // Save full content to local storage for offline access
          touchMetadataUsage(mergedContent.id);
          safeStorage.setItem(
            `movie_details_${mergedContent.id}`,
            JSON.stringify(mergedContent),
          );

          // Minimize data to prevent QuotaExceededError
          const minimizedContent = {
            id: mergedContent.id,
            title: mergedContent.title,
            posterUrl: mergedContent.posterUrl,
            type: mergedContent.type,
            quality: (mergedContent as any).quality || mergedContent.qualityId,
            printQuality: (mergedContent as any).printQuality,
            audio: (mergedContent as any).audio,
            year: mergedContent.year,
            imdbRating: mergedContent.imdbRating,
            ageRating: (mergedContent as any).ageRating,
            duration: (mergedContent as any).duration,
            status: mergedContent.status,
          };

          // Add to front
          recent.unshift(minimizedContent as any);
          // Keep max 25
          if (recent.length > 25) recent = recent.slice(0, 25);
          safeStorage.setItem("recently_viewed", JSON.stringify(recent));

          // Cleanup old movie_details is now mostly handled automatically by IndexedDB size, but we can do a best effort using localstorage fallback keys if any
          try {
            const recentIds = recent.map((r) => `movie_details_${r.id}`);
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (
                key?.startsWith("movie_details_") &&
                !recentIds.includes(key)
              ) {
                keysToRemove.push(key);
              }
            }
            keysToRemove.forEach((k) => {
              localStorage.removeItem(k);
              safeStorage.removeItemAsync(k);
            });
          } catch (e) {}
        } catch (e) {
          console.error("Failed to update recently viewed", e);
        }
      }
    }
  }, [
    content,
    contentLoading,
    profile?.uid,
    fullContent,
    mergedContent,
    fetchFailed,
    isOffline,
  ]);

  // Removed buggy popstate logic for popups

  const hasAttemptedStaticFetch = useRef<Record<string, boolean>>({});
  const hasAttemptedEpisodeFetch = useRef<Record<string, boolean>>({});
  const hasAttemptedRatingFetch = useRef<Record<string, boolean>>({});

  // Fetch Live IMDb Rating independently
  useEffect(() => {
    if (
      !mergedContent ||
      !id ||
      hasAttemptedRatingFetch.current[id] ||
      isOffline
    )
      return;

    const fetchRating = async () => {
      const cached = getCachedImdbRating(id);
      const ratingCacheKey = `imdb_rating_${id}`;

      // Show cached immediately if available (< 5 days old)
      if (cached?.rawRating || cached?.rating) {
        const cachedRating = cached.rawRating || `${cached.rating}/10`;
        setLiveRating(cachedRating);
        if (mergedContent.imdbRating !== cachedRating) {
          setCachedMetadata((prev) => {
            const newCache = { ...prev.data, imdbRating: cachedRating };
            safeStorage.setItem(
              `content_cache_${id}`,
              JSON.stringify(newCache),
            );
            return { ...prev, data: newCache };
          });
        }
      }

      let imdbId = mergedContent.imdbLink?.match(/tt\d+/)?.[0];
      if (!imdbId) {
        // If no IMDb ID, attempt live reload helper which uses TMDB to discover IMDb ID
        reloadLiveImdbRating(mergedContent).then((res) => {
          if (res?.rawRating || res?.rating) {
            const resRating = res.rawRating || `${res.rating}/10`;
            setLiveRating(resRating);
          }
        }).catch(() => {});
        return;
      }

      hasAttemptedRatingFetch.current[id] = true;
      setFetchingImdb(true);
      try {
        let omdbRes = await fetch(`/api/omdb?i=${imdbId}`);
        if (!omdbRes.ok) {
          const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY || "19daa310";
          omdbRes = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`);
        }
        const omdbData = await omdbRes.json();
        if (omdbData.imdbRating && omdbData.imdbRating !== "N/A") {
          const newRating = `${omdbData.imdbRating}/10`;
          saveImdbRatingToStorage(id, omdbData.imdbRating, imdbId, omdbData.imdbVotes);
          sessionStorage.setItem(ratingCacheKey, newRating);
          setLiveRating(newRating);

          if (mergedContent.imdbRating !== newRating) {
            setCachedMetadata((prev) => {
              const newCache = { ...prev.data, imdbRating: newRating };
              safeStorage.setItem(
                `content_cache_${id}`,
                JSON.stringify(newCache),
              );
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

    // If we are currently fetching the full document from Firebase, wait for it
    if (isMinimal && (!fullContent || fullContent.id !== id) && !fetchFailed)
      return;

    let seasons: any[] = [];
    try {
      // Prioritize seasons from database (fullContent) to ensure links are preserved
      const validFullContent = fullContent?.id === id ? fullContent : null;
      const seasonsSource =
        validFullContent?.type === "series" && validFullContent.seasons
          ? validFullContent.seasons
          : mergedContent?.seasons;
      seasons =
        mergedContent?.type === "series" && seasonsSource
          ? Array.isArray(seasonsSource)
            ? seasonsSource
            : JSON.parse(seasonsSource || "[]")
          : [];
    } catch (e) {
      console.error("Error parsing seasons in fetchMissingData:", e);
    }

    const needsEpisodeData =
      mergedContent?.type === "series" &&
      seasons.length > 0 &&
      seasons.some(
        (s: any) =>
          !s.episodes ||
          s.episodes.length === 0 ||
          s.episodes.some(
            (ep: any) =>
              !ep.description ||
              !ep.duration ||
              !ep.title ||
              /^Episode\s+\d+$/i.test(ep.title) ||
              /^episode/i.test(ep.description || "")
          ),
      );

    if (!force && hasAttemptedStaticFetch.current[id] && (!needsEpisodeData || hasAttemptedEpisodeFetch.current[id])) return;

    const needsStaticData =
      force ||
      !mergedContent.ottPlatform ||
      !mergedContent.runtime ||
      !mergedContent.description ||
      !mergedContent.cast ||
      (Array.isArray(mergedContent.cast) && mergedContent.cast.length === 0) ||
      !mergedContent.releaseDate ||
      !mergedContent.posterUrl ||
      !mergedContent.country ||
      !mergedContent.trailerUrl ||
      !mergedContent.imdbLink ||
      !mergedContent.imdbRating ||
      !mergedContent.genreIds ||
      mergedContent.genreIds.length === 0 ||
      needsEpisodeData;

    if (!needsStaticData) {
      return;
    }

    hasAttemptedStaticFetch.current[id] = true;
    setFetchingImdb(true);

    try {
      let tmdbId = "";
      let tmdbType = "";
      let imdbId = mergedContent.imdbLink?.match(/tt\d+/)?.[0] || "";

      const searchForceType = mergedContent.type === "series" ? "tv" : "movie";

      // 1. Try IMDb ID first via MediaModal
      if (imdbId) {
        const found = await findTMDBByImdb(imdbId, searchForceType);
        if (found) {
          tmdbId = found.item.id;
          tmdbType = found.type;
        } else {
          const fallbackFind = await findTMDBByImdb(
            imdbId,
            searchForceType === "movie" ? "tv" : "movie",
          );
          if (fallbackFind) {
            tmdbId = fallbackFind.item.id;
            tmdbType = fallbackFind.type;
          }
        }
      }

      // 2. Try Title + Year if not found via MediaModal search
      if (!tmdbId && mergedContent.title) {
        const results = await searchTMDBByTitle(
          mergedContent.title,
          mergedContent.year?.toString() || "",
          searchForceType,
        );
        if (results && results.length > 0) {
          const normalizeStr = (str: string) =>
            (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const searchTitleNorm = normalizeStr(mergedContent.title);
          const exactMatches = results.filter((r: any) => {
            const titleNorm = normalizeStr(
              r.item.title ||
                r.item.name ||
                r.item.original_title ||
                r.item.original_name,
            );
            return titleNorm === searchTitleNorm;
          });

          if (exactMatches.length > 0) {
            tmdbId = exactMatches[0].item.id;
            tmdbType = exactMatches[0].type;
          }
        }
      }

      if (!tmdbId) {
        setFetchingImdb(false);
        return;
      }

      const updates: Partial<Content> = {};
      let hasUpdates = false;

      // 3. Fetch Full Details strictly using MediaModal
      let details: any = null;
      try {
        details = await fetchTMDBDetails(tmdbId, tmdbType);
      } catch (e) {
        console.error("Failed to fetch full tmdb details", e);
      }

      if (details) {
        if (force || !mergedContent.secondTitle) {
          const mediaModalSecondTitle = getBestAlternativeTitle(details);
          if (mediaModalSecondTitle && isRomanized(mediaModalSecondTitle)) {
            updates.secondTitle = mediaModalSecondTitle;
            hasUpdates = true;
          }
        }

        if ((force || !mergedContent.description) && details.overview) {
          updates.description = details.overview;
          hasUpdates = true;
        }
        if (
          (force || !mergedContent.releaseDate) &&
          (details.release_date || details.first_air_date)
        ) {
          updates.releaseDate = details.release_date || details.first_air_date;
          hasUpdates = true;
        }
        const newPosterUrl = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : undefined;
        if (newPosterUrl && (force || !mergedContent.posterUrl || mergedContent.posterUrl !== newPosterUrl)) {
          updates.posterUrl = newPosterUrl;
          hasUpdates = true;
        }

        if (force || !mergedContent.runtime) {
          if (details.runtime) {
            updates.runtime = `${details.runtime} min`;
            hasUpdates = true;
          } else if (
            details.episode_run_time &&
            details.episode_run_time.length > 0
          ) {
            updates.runtime = `${details.episode_run_time[0]} min/episode`;
            hasUpdates = true;
          }
        }

        if (force || !mergedContent.country) {
          const countryStr =
            details.production_countries?.map((c: any) => c.name).join(", ") ||
            (details.origin_country ? details.origin_country.join(", ") : "");
          if (countryStr) {
            updates.country = countryStr;
            hasUpdates = true;
          }
        }

        if (
          force ||
          !mergedContent.cast ||
          (Array.isArray(mergedContent.cast) &&
            mergedContent.cast.length === 0 &&
            details.credits?.cast &&
            details.credits.cast.length > 0)
        ) {
          if (details.credits?.cast && details.credits.cast.length > 0) {
            updates.cast = details.credits.cast
              .slice(0, 5)
              .map((a: any) => a.name);
            hasUpdates = true;
          } else if (!mergedContent.cast) {
            // Only set to empty array once if it's completely missing
            updates.cast = [];
            hasUpdates = true;
          }
        }

        if (
          (force || !mergedContent.imdbLink) &&
          details.external_ids?.imdb_id
        ) {
          updates.imdbLink = `https://www.imdb.com/title/${details.external_ids.imdb_id}`;
          imdbId = details.external_ids.imdb_id;
          hasUpdates = true;
        }

        if (
          (force ||
            !mergedContent.genreIds ||
            mergedContent.genreIds.length === 0) &&
          details.genres
        ) {
          const matchedGenreIds: string[] = [];
          details.genres.forEach((tg: any) => {
            const match = genres.find(
              (g) => g.name.toLowerCase() === tg.name.toLowerCase(),
            );
            if (match) matchedGenreIds.push(match.id);
          });
          if (matchedGenreIds.length > 0) {
            updates.genreIds = matchedGenreIds;
            hasUpdates = true;
          }
        }

        // Fetch IMDB Rating using MediaModal logic
        if ((force || !mergedContent.imdbRating) && imdbId) {
          const ratingData = await fetchIMDbRating(imdbId);
          if (ratingData && ratingData.rating && ratingData.rating !== "N/A") {
            updates.imdbRating = `${ratingData.rating}/10`;
            saveImdbRatingToStorage(id, ratingData.rating, imdbId, ratingData.votes);
            hasUpdates = true;
          }
        }

        // Fetch/Extract OTT Platform
        if (force || !mergedContent.ottPlatform) {
          let detectedOtt = extractOttPlatformFromTMDBDetails(details, searchForceType);
          if (!detectedOtt && details.id && searchForceType === "movie") {
            const { platformNote } = await fetchMovieDigitalReleaseDate(details.id);
            if (platformNote) detectedOtt = platformNote;
          }
          if (!detectedOtt) {
            detectedOtt = await predictOttPlatformWithAI(
              mergedContent.title || details.title || details.name || '',
              searchForceType === "tv" ? "tv" : "movie",
              (details.release_date || details.first_air_date || "").split("-")[0],
              details.overview,
              details.genres?.map((g: any) => g.name),
              details.original_title || details.original_name,
              details.production_countries?.map((c: any) => c.name).join(", ")
            );
          }
          if (detectedOtt) {
            updates.ottPlatform = detectedOtt;
            saveImdbRatingToStorage(id, undefined, undefined, undefined, detectedOtt);
            hasUpdates = true;
          }
        }

        // Fetch Trailer using MediaModal logic (getBestTrailer -> KinoCheck -> YouTube)
        if (force || !mergedContent.trailerUrl) {
          let trailerUrl = getBestTrailer(details.videos) || "";
          if (!trailerUrl) {
            trailerUrl = (await fetchKinoCheckTrailer(tmdbId, tmdbType)) || "";
          }
          if (!trailerUrl) {
            const ytResults = await searchYouTubeTrailer(
              mergedContent.title || details.name || details.title,
              tmdbType,
            );
            if (ytResults && ytResults.length > 0) {
              ytResults.sort((a: any, b: any) => {
                const tA = a.title.toLowerCase();
                const tB = b.title.toLowerCase();
                const p = (t: string) => {
                  if (t.includes("official") && t.includes("trailer")) return 1;
                  if (t.includes("trailer")) return 2;
                  if (t.includes("teaser")) return 3;
                  if (t.includes("clip")) return 4;
                  return 5;
                };
                return p(tA) - p(tB);
              });
              trailerUrl = ytResults[0].url;
            }
          }
          if (trailerUrl) {
            updates.trailerUrl = trailerUrl;
            try {
              const res = await fetch(
                `https://www.youtube.com/oembed?url=${trailerUrl}&format=json`,
              );
              if (res.ok) {
                const ytData = await res.json();
                if (ytData.title) updates.trailerTitle = ytData.title;
              }
            } catch (e) {}
            hasUpdates = true;
          }
        }

        // Episode Data Fetching for Series
        if (mergedContent.type === "series" && seasons.length > 0) {
          hasAttemptedEpisodeFetch.current[id] = true;
          try {
            const existingSeasonsData = details.seasons || [];
            const seasonsDataFromTMDB = await fetchSeriesSeasons(
              tmdbId,
              existingSeasonsData,
            );

            let seasonsUpdated = false;
            const currentSeasons = [...seasons];

            for (let i = 0; i < currentSeasons.length; i++) {
              const season = currentSeasons[i];
              const tmdbSeason = seasonsDataFromTMDB.find(
                (s: any) =>
                  parseInt(s.season) ===
                  parseInt(season.seasonNumber.toString()),
              );
              if (tmdbSeason) {
                if (
                  tmdbSeason.year &&
                  tmdbSeason.year !== "N/A" &&
                  !season.year
                ) {
                  season.year = parseInt(tmdbSeason.year);
                  seasonsUpdated = true;
                }
                if (tmdbSeason.episodes) {
                  const existingEpisodes = season.episodes || [];
                  let episodeUpdated = false;
                  season.episodes = existingEpisodes.map((existingEp: any) => {
                    const tmdbEp = tmdbSeason.episodes.find(
                      (ep: any) =>
                        parseInt(ep.episode_number || ep.episode) ===
                        parseInt(existingEp.episodeNumber.toString()),
                    );
                    if (tmdbEp) {
                      const newTitle =
                        (!existingEp.title ||
                          /^Episode\s+\d+$/i.test(existingEp.title)) &&
                        tmdbEp.name
                          ? tmdbEp.name
                          : existingEp.title;

                      // Only keep existing description if it's not a placeholder
                      const isDescPlaceholder = !existingEp.description || /^episode/i.test(existingEp.description);
                      const newDesc =
                        isDescPlaceholder
                          ? tmdbEp.overview || tmdbEp.description || ""
                          : existingEp.description;

                      // Only keep existing duration if it's valid and not a placeholder
                      const isDurPlaceholder = !existingEp.duration || existingEp.duration === "N/A";
                      const fallbackDur = tmdbEp.runtime ? `${tmdbEp.runtime}m` : (details.episode_run_time && details.episode_run_time[0] ? `${details.episode_run_time[0]}m` : "");
                      const newDur =
                        isDurPlaceholder
                          ? fallbackDur
                          : existingEp.duration;

                      if (
                        newTitle !== existingEp.title ||
                        newDesc !== existingEp.description ||
                        (newDur && newDur !== existingEp.duration)
                      ) {
                        episodeUpdated = true;
                        return {
                          ...existingEp,
                          title: newTitle,
                          description: newDesc,
                          duration: newDur,
                        };
                      }
                    }
                    return existingEp;
                  });
                  if (episodeUpdated) seasonsUpdated = true;
                }
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
        setCachedMetadata((prev) => {
          if (prev.id !== id) return prev;
          const newCache = { ...prev.data, ...updates };
          safeStorage.setItem(`content_cache_${id}`, JSON.stringify(newCache));
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
    const regExp =
      /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11
      ? `https://www.youtube.com/embed/${match[2]}`
      : null;
  };

  useEffect(() => {
    return () => {
      // Set flag when leaving MovieDetails to trigger WhatsApp prompt on Home
      sessionStorage.setItem("from_movie_details", "true");
    };
  }, []);

  useEffect(() => {
    if (
      !contentLoading &&
      !mergedContent &&
      fetchFailed &&
      !hasAttemptedGlobalRefresh
    ) {
      setHasAttemptedGlobalRefresh(true);
      if (!isOffline) {
        checkForUpdates(false).catch((e) =>
          console.error("Error refreshing content:", e),
        );
        refreshProfile(false).catch((e) =>
          console.error("Error refreshing user:", e),
        );
      }
    }
  }, [
    contentLoading,
    mergedContent,
    fetchFailed,
    hasAttemptedGlobalRefresh,
    isOffline,
    checkForUpdates,
    refreshProfile,
  ]);

  if (loading || profileLoading || isManualRefreshing) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          {isManualRefreshing && (
            <p className="text-sm font-medium text-zinc-500 animate-pulse">
              {t("Refreshing content...")}
            </p>
          )}
        </div>
      </div>
    );
  }

  const isAuthorized = mergedContent
    ? profile?.role === "admin" ||
      profile?.role === "owner" ||
      profile?.role === "content_manager" ||
      profile?.role === "manager" ||
      mergedContent.status !== "draft"
    : false;

  if (!mergedContent || !isAuthorized) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center text-zinc-900 dark:text-white p-4">
        {!contentLoading && fetchFailed && !hasAttemptedGlobalRefresh ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {t('Search global library...')}
            </p>
          </div>
        ) : (
          <div className="text-center space-y-6 max-w-md">
            <div className="space-y-4">
              <h2 className="text-xl font-bold">
                {t('Content not found or unavailable')}
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {t('This content may have been removed or you don\'t have access to it.')}
              </p>
            </div>
            
            <div className="pt-4 flex flex-col gap-3">
              <button
                onClick={async () => {
                  vibrate(50);
                  setIsManualRefreshing(true);
                  try {
                    await Promise.all([
                      checkForUpdates(true),
                      refreshProfile(true, 'manual'),
                      refreshSettings(true)
                    ]);
                    // Give a small delay for state to propagate
                    await new Promise(resolve => setTimeout(resolve, 800));
                  } catch (e) {
                    console.error("Manual refresh failed", e);
                  } finally {
                    setIsManualRefreshing(false);
                  }
                }}
                disabled={isSyncing || isManualRefreshing}
                className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:text-zinc-400 text-white font-semibold transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
              >
                <RefreshCw className={clsx("w-5 h-5", (isSyncing || isManualRefreshing) && "animate-spin")} />
                {(isSyncing || isManualRefreshing) ? t("Refreshing...") : t("Refresh App Data")}
              </button>
              
              <Link
                to="/"
                className="text-sm font-medium text-zinc-500 hover:text-emerald-500 transition-colors"
              >
                {t('Go back to Home')}
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isPending = profile?.status === "pending";
  const isExpired = profile?.status === "expired";
  const isSelectedContent = profile?.role === "selected_content";
  const isAssigned = profile?.assignedContent?.some(
    (id) => id === mergedContent.id || id.startsWith(`${mergedContent.id}:`),
  );
  const canPlay =
    profile?.role !== "user" && (
      profile?.role === "admin" ||
      profile?.role === "owner" ||
      profile?.role === "content_manager" ||
      profile?.role === "manager" ||
      isAssigned ||
      (profile?.status === "active" &&
        !(isSelectedContent || mergedContent.status === "selected_content"))
    );

  const allowedSeasons =
    profile?.assignedContent
      ?.filter((id) => id.startsWith(`${mergedContent.id}:`))
      .map((id) => id.split(":")[1]) || [];
  const hasFullAccess =
    profile?.role !== "user" && (
      profile?.role === "admin" ||
      profile?.role === "owner" ||
      profile?.role === "content_manager" ||
      profile?.role === "manager" ||
      profile?.assignedContent?.includes(mergedContent.id) ||
      (profile &&
        profile.status === "active" &&
        !(isSelectedContent || mergedContent.status === "selected_content"))
    );

  const toggleWatchLater = async () => {
    if (!profile) {
      setShowLoginPrompt(true);
      return;
    }
    vibrate(50);
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
    if (!profile) {
      setShowLoginPrompt(true);
      return;
    }
    vibrate(50);
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
      await deleteContent(id, fullContent?.chunkId);
      navigate("/admin/content");
    } catch (error) {
      console.error("Error deleting content:", error);
      setAlertConfig({
        isOpen: true,
        title: "Error",
        message: "Failed to delete content",
      });
    }
  };

  const handleTelegramResolve = async (id: string, url: string) => {
    setResolvingTgId(id);
    try {
      let targetUrl = url;

      const res = await fetch(`/api/resolve-tg?url=${encodeURIComponent(targetUrl)}`);
      const data = await res.json();
      if (res.ok && data.url) {
        if (data.url.startsWith("tg://")) {
          window.location.href = data.url;
        } else {
          window.open(data.url, "_blank") || (window.location.href = data.url);
        }
      } else {
        setAlertConfig({
          isOpen: true,
          title: t("Telegram Link Error"),
          message: data.error || t("Failed to resolve Telegram link"),
        });
      }
    } catch (e) {
      console.error(e);
      setAlertConfig({
        isOpen: true,
        title: t("Telegram Link Error"),
        message: t("An error occurred fetching Telegram link"),
      });
    } finally {
      setResolvingTgId(null);
    }
  };

  const handlePlayClick = async (
    url: string,
    linkName?: string,
    linkId?: string,
    isZip?: boolean,
    tinyUrl?: string,
    isLocked?: boolean,
    seasonInfo?: { id: string; number: number; title?: string },
    formattedTitle?: string,
  ) => {
    // Check eligibility before opening links
    const checkEligibility = () => {
      if (linkId === "sample") return true;
      if (!profile) {
        setShowLoginPrompt(true);
        return false;
      }
      if (!canPlay || isLocked) {
        // Set locked content info for the alert modal
        if (mergedContent) {
          if (seasonInfo) {
            const basePrice = settings?.seasonFee || 100;
            const finalPrice = mergedContent.status === "selected_content" ? basePrice * 2 : basePrice;
            setLockedContentInfo({
              id: mergedContent.id,
              type: "season",
              seasonId: seasonInfo.id,
              seasonNumber: seasonInfo.number,
              title: `${mergedContent.title} - Season ${seasonInfo.number}${seasonInfo.title ? ` (${seasonInfo.title})` : ""}`,
              price: finalPrice,
            });
          } else if (mergedContent.type === "movie") {
            const basePrice = settings?.movieFee || 50;
            const finalPrice = mergedContent.status === "selected_content" ? basePrice * 2 : basePrice;
            setLockedContentInfo({
              id: mergedContent.id,
              type: "movie",
              title: mergedContent.title,
              price: finalPrice,
            });
          }
        }

        if (mergedContent?.status === "selected_content") {
          setAlertConfig({
            isOpen: true,
            title: t("Content Locked"),
            message: t("You don't have access to this content. Contact Admin."),
          });
        } else if (isPending) {
          setAlertConfig({
            isOpen: true,
            title: t("Account Pending"),
            message: t("Your account activation is pending. Please Get Membership or Add any content to cart to activate your account."),
          });
        } else if (isExpired) {
          if (profile?.role === "trial") {
            setAlertConfig({
              isOpen: true,
              title: t("Trial Expired"),
              message: t("Your free Trial has expired. Please get Membership to continue watching."),
            });
          } else {
            setAlertConfig({
              isOpen: true,
              title: t("Membership Expired"),
              message:
                t("Your membership has expired. Please renew to continue watching."),
            });
          }
        } else {
          setAlertConfig({
            isOpen: true,
            title: t("Content Locked"),
            message:
              t("This content is locked. Please contact admin to get access to this movie/series."),
          });
        }
        return false;
      }
      return true;
    };

    if (!checkEligibility()) return;

    let targetUrl = url;
    try {
      const u = new URL(targetUrl);
      const host = u.hostname.toLowerCase();
      if (host.includes('hubcould') || host.includes('hubcloud') || host.includes('vcloud')) {
        u.hostname = 'hubcloud.cx';
        targetUrl = u.toString();
      } else if (host.includes('hubdrive')) {
        u.hostname = 'hubdrive.space';
        targetUrl = u.toString();
      }
    } catch (e) {}

    if (linkId !== "sample") {
      // tracking removed
    }

    if (isOffline) {
      setAlertConfig({
        isOpen: true,
        title: "No Internet",
        message: "You need an internet connection to open this link.",
      });
      return;
    }

    let finalUrl = targetUrl;
    let finalTinyUrl = finalUrl === url ? tinyUrl : undefined;
    let finalCandidates: { text: string; href: string }[] | undefined;
    let finalSize: string | undefined;

    const isVcloudHost = targetUrl.includes("vcloud");
    const isVcloudName = linkName
      ? linkName.toLowerCase().includes("vcloud")
      : false;
    const isVcloud = isVcloudHost || isVcloudName;

    const isHubcloudRawLink = (u: string) => {
      if (!u) return false;
      const l = u.toLowerCase();
      return (
        l.includes("hubcloud") ||
        l.includes("hubcould") ||
        l.includes("hubdrive") ||
        l.includes("vcloud")
      );
    };

    if (isHubcloudRawLink(targetUrl) || isVcloud) {
      const clickId = targetUrl;
      setExtractingLinkId(clickId);

      let shouldExtract = true;
      const now = Date.now();

      let cachedLocal: any = null;
      try {
        const cacheStr = localStorage.getItem("hubcloud_extraction_cache");
        if (cacheStr) {
          const cacheObj = JSON.parse(cacheStr);

          // Prune old entries (> 10 mins) to prevent localStorage bloat
          const prunedObj: Record<string, any> = {};
          let changed = false;
          for (const key in cacheObj) {
            if (now - cacheObj[key].timestamp < 600000) {
              prunedObj[key] = cacheObj[key];
            } else {
              changed = true;
            }
          }
          if (changed) {
            localStorage.setItem(
              "hubcloud_extraction_cache",
              JSON.stringify(prunedObj),
            );
          }

          if (prunedObj[url] || prunedObj[targetUrl]) {
            cachedLocal = prunedObj[url] || prunedObj[targetUrl];
          }
        }
      } catch (e) {}

      const cached = hubcloudCacheRef.current[targetUrl] || hubcloudCacheRef.current[url] || cachedLocal;

      // If we have a valid cached link within 10 minutes (600,000 ms), use it directly
      if (cached && now - cached.timestamp < 600000 && cached.url && !isHubcloudRawLink(cached.url)) {
        shouldExtract = false;
        finalUrl = cached.url;
        finalTinyUrl = undefined;
        finalCandidates = cached.candidates;
        finalSize = cached.size;
        hubcloudCacheRef.current[targetUrl] = cached; // Update memory cache
      }

      let extractionFailed = false;

      if (shouldExtract) {
        try {
          const res = await fetch("/api/hubcloud/direct-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: targetUrl, isVcloud, forceExtract: isVcloudName }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.url && data.url !== targetUrl && !isHubcloudRawLink(data.url)) {
              finalUrl = data.url;
              finalTinyUrl = undefined; // Drop the old tinyurl since url changed!
              finalCandidates = data.candidates;
              finalSize = data.size;

              // Save to cache (memory and localStorage)
              const cacheEntry = {
                url: finalUrl,
                candidates: finalCandidates,
                size: finalSize,
                timestamp: Date.now(),
              };
              hubcloudCacheRef.current[targetUrl] = cacheEntry;
              try {
                const cacheStr = localStorage.getItem(
                  "hubcloud_extraction_cache",
                );
                const cacheObj = cacheStr ? JSON.parse(cacheStr) : {};
                cacheObj[targetUrl] = cacheEntry;
                localStorage.setItem(
                  "hubcloud_extraction_cache",
                  JSON.stringify(cacheObj),
                );
              } catch (e) {}
            } else {
              extractionFailed = true;
            }
          } else {
            extractionFailed = true;
          }
        } catch (e) {
          console.error("Failed to resolve link", e);
          extractionFailed = true;
        }
      }

      setExtractingLinkId((prev) => (prev === clickId ? null : prev));

      const isStillHubcloud = !finalUrl || finalUrl === targetUrl || isHubcloudRawLink(finalUrl);

      if (extractionFailed || isStillHubcloud) {
        setAlertConfig({
          isOpen: true,
          title: t("Extraction Error"),
          message: t("Error in extracting links, please try again"),
        });
        return;
      }

      setLinkPopup({
        isOpen: true,
        url: finalUrl,
        originalUrl: targetUrl,
        name: linkName || "Unknown Link",
        id: linkId || "unknown",
        isZip,
        tinyUrl: finalTinyUrl,
        candidates: finalCandidates,
        size: finalSize,
        formattedTitle,
      });
      return;
    }

    setLinkPopup({
      isOpen: true,
      url: finalUrl,
      originalUrl: targetUrl,
      name: linkName || "Unknown Link",
      id: linkId || "unknown",
      isZip,
      tinyUrl: finalTinyUrl,
      candidates: finalCandidates,
      size: finalSize,
      formattedTitle,
    });
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

  const trackStreamAndCheckRate = async () => {
    if (!profile) return;
    const hasRated = safeStorage.getItem('has_rated') === 'true';
    if (hasRated) return;

    let streamedContentIds: string[] = [];
    try {
      const stored = safeStorage.getItem('streamed_contents');
      if (stored) {
        streamedContentIds = JSON.parse(stored);
      }
    } catch (e) {}

    if (mergedContent && !streamedContentIds.includes(mergedContent.id)) {
      streamedContentIds.push(mergedContent.id);
      safeStorage.setItem('streamed_contents', JSON.stringify(streamedContentIds));
    }

    if (streamedContentIds.length === 3) {
      const promptShownFor = safeStorage.getItem('rate_prompt_shown_for');
      if (promptShownFor !== '3') {
        try {
          // Verify if they actually haven't rated in the DB
          const data = await fetchReviewsFromChunks(false);
          if (data && data.some(r => r.userId === profile.uid)) {
            safeStorage.setItem('has_rated', 'true');
            return;
          }
        } catch (e) {}
        setTimeout(() => setShowRatePrompt(true), 1000);
        safeStorage.setItem('rate_prompt_shown_for', '3');
      }
    }
  };

  const handlePlayExternal = async (
    player: "vlc" | "mx" | "generic" | "download" | "browser",
  ) => {
    if (!linkPopup) return;

    if (profile?.uid) {
      logEvent("link_click", profile.uid, {
        contentId: mergedContent.id,
        contentTitle: mergedContent.title,
        linkId: linkPopup.id,
        linkName: linkPopup.name,
        playerType: player,
      });
    }

    trackStreamAndCheckRate();

    let urlToPlay = linkPopup.url;

    const lowerUrl = urlToPlay.toLowerCase();
    if (
      lowerUrl.includes("hubcloud") ||
      lowerUrl.includes("hubcould") ||
      lowerUrl.includes("hubdrive") ||
      lowerUrl.includes("vcloud")
    ) {
      setAlertConfig({
        isOpen: true,
        title: t("Extraction Error"),
        message: t("Error in extracting links, please try again"),
      });
      closeLinkPopup();
      return;
    }

    if (!urlToPlay.startsWith("http")) {
      urlToPlay = "https://" + urlToPlay;
    }

    if (player === "browser") {
      let browserUrl = urlToPlay;

      // Pixeldrain hotlink bypass: ensure we use the viewer page (/u/) for browser viewing
      browserUrl = browserUrl.replace(
        /(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/api\/file\//i,
        "pixeldrain.dev/u/",
      );
      browserUrl = browserUrl.replace(
        /(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/u\//i,
        "pixeldrain.dev/u/",
      );

      if (browserUrl.includes("pixeldrain.dev/u/")) {
        try {
          const urlObj = new URL(browserUrl);
          urlObj.search = ""; // Remove query params like ?download=true
          browserUrl = urlObj.toString();
        } catch (e) {}
      }

      const isAndroid = /Android/i.test(navigator.userAgent);
      if (isAndroid) {
        try {
          const urlObj = new URL(browserUrl);
          const scheme = urlObj.protocol.replace(":", "");
          const hostAndPath =
            urlObj.host + urlObj.pathname + urlObj.search + urlObj.hash;
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
      const blob = new Blob([html], { type: "text/html" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      closeLinkPopup();
      return;
    }

    if (player === "download") {
      let copyUrl = urlToPlay;
      const isPixeldrain =
        copyUrl.includes("pixeldrain.com") ||
        copyUrl.includes("pixeldrain.dev") ||
        copyUrl.includes("pixeldrain.net") ||
        copyUrl.includes("pixel.drain") ||
        copyUrl.includes("pixeldra.in");

      // We don't use tinyurl anymore as per request
      /*
      if (!isPixeldrain) {
        if (linkPopup.tinyUrl) {
          copyUrl = linkPopup.tinyUrl;
        } else {
          try {
            const { generateTinyUrl } = await import("../../utils/tinyurl");
            copyUrl = await generateTinyUrl(copyUrl, false);
          } catch (e) {
            console.error("Failed to generate tinyurl on the fly", e);
          }
        }
      }
      */

      navigator.clipboard
        .writeText(copyUrl)
        .then(() => {
          setAlertConfig({
            isOpen: true,
            title: "Link Copied!",
            message: "The link has been copied to your clipboard.",
          });
        })
        .catch((err) => {
          console.error("Failed to copy", err);
          setAlertConfig({
            isOpen: true,
            title: "Copy Failed",
            message: "Could not copy link. Please copy it manually: " + copyUrl,
          });
        });
      closeLinkPopup();
      return;
    }

    // For video players, we need the raw file API endpoint, not the viewer page
    let videoUrl = urlToPlay;
    if (player === "vlc" || player === "mx" || player === "generic") {
      videoUrl = videoUrl.replace(
        /(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/u\//i,
        "pixeldrain.dev/api/file/",
      );
      videoUrl = videoUrl.replace(
        /(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/api\/file\//i,
        "pixeldrain.dev/api/file/",
      );

      if (videoUrl.includes("pixeldrain.dev/api/file/")) {
        try {
          const urlObj = new URL(videoUrl);
          urlObj.search = ""; // Remove query params
          videoUrl = urlObj.toString();
        } catch (e) {}
      }
    }

    try {
      const urlObj = new URL(videoUrl);
      const scheme = urlObj.protocol.replace(":", "");
      const hostAndPath =
        urlObj.host + urlObj.pathname + urlObj.search + urlObj.hash;
      const title = encodeURIComponent(
        linkPopup.formattedTitle || mergedContent.title,
      );

      let intentUrl = "";
      if (player === "vlc") {
        intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};package=org.videolan.vlc;type=video/*;S.title=${title};end`;
      } else if (player === "mx") {
        intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};package=com.mxtech.videoplayer.ad;type=video/*;S.title=${title};end`;
      } else {
        intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};action=android.intent.action.VIEW;type=video/*;end`;
      }

      window.location.href = intentUrl;
    } catch (e) {
      console.error("Invalid URL for external player", e);
      const a = document.createElement("a");
      a.href = videoUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    closeLinkPopup();
  };

  const handleReportLink = async () => {
    if (!profile) {
      setShowLoginPrompt(true);
      return;
    }
    if (!linkPopup || !mergedContent) return;

    setIsReporting(true);
    try {
      const activeReports = (profile.reported_links || []).filter(
        (r: any) => r.status === "pending",
      ).length;
      if (activeReports >= 5) {
        setAlertConfig({
          isOpen: true,
          title: "Limit Reached",
          message: "You can only have 5 pending reported links at a time.",
        });
        setIsReporting(false);
        return;
      }

      const alreadyReported = profile.reported_links?.some((r: any) => {
        if (r.status !== "pending") return false;

        const hasValidIdCheck =
          r.linkId &&
          linkPopup.id &&
          linkPopup.id !== "unknown" &&
          linkPopup.id !== "sample" &&
          r.linkId === linkPopup.id;
        const currentUrl = linkPopup.originalUrl || linkPopup.url;
        const hasValidUrlCheck =
          r.linkUrl && currentUrl && r.linkUrl === currentUrl;

        return hasValidIdCheck || hasValidUrlCheck;
      });

      if (alreadyReported) {
        setAlertConfig({
          isOpen: true,
          title: "Already Reported",
          message: "You have already reported this link. We are working on it!",
        });
        setIsReporting(false);
        return;
      }

      const reportId = Math.floor(
        10000000 + Math.random() * 90000000,
      ).toString();

      const reportData = {
        id: reportId,
        userId: profile.uid,
        userName: profile.displayName || profile.email || "Unknown User",
        contentId: mergedContent.id,
        contentTitle: mergedContent.title,
        contentType: mergedContent.type,
        linkId: linkPopup.id,
        linkName: linkPopup.name,
        linkUrl: linkPopup.originalUrl || linkPopup.url,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      await updateUserProfileData(
        { reported_links: [...(profile.reported_links || []), reportData] },
        undefined,
        true,
      );
      setAlertConfig({
        isOpen: true,
        title: "Report Submitted",
        message:
          "Thank you for reporting. We will check and fix this link soon.",
      });
      closeLinkPopup();
    } catch (error) {
      console.error("Error reporting link:", error);
      setAlertConfig({
        isOpen: true,
        title: "Error",
        message: "Failed to submit report. Please try again later.",
      });
    } finally {
      setIsReporting(false);
    }
  };

  const handlePlayDirectly = async () => {
    if (!linkPopup) return;

    if (profile?.uid) {
      logEvent("link_click", profile.uid, {
        contentId: mergedContent.id,
        contentTitle: mergedContent.title,
        linkId: linkPopup.id,
        linkName: linkPopup.name,
      });
    }

    trackStreamAndCheckRate();

    let url = linkPopup.url;

    const lowerUrl = url.toLowerCase();
    if (
      lowerUrl.includes("hubcloud") ||
      lowerUrl.includes("hubcould") ||
      lowerUrl.includes("hubdrive") ||
      lowerUrl.includes("vcloud")
    ) {
      setAlertConfig({
        isOpen: true,
        title: t("Extraction Error"),
        message: t("Error in extracting links, please try again"),
      });
      closeLinkPopup();
      return;
    }

    if (!url.startsWith("http")) {
      url = "https://" + url;
    }

    // Pixeldrain hotlink bypass: ensure we use the viewer page (/u/) for browser viewing
    url = url.replace(
      /(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/api\/file\//i,
      "pixeldrain.dev/u/",
    );
    url = url.replace(
      /(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/u\//i,
      "pixeldrain.dev/u/",
    );

    if (url.includes("pixeldrain.dev/u/")) {
      try {
        const urlObj = new URL(url);
        urlObj.search = ""; // Remove query params like ?download=true
        url = urlObj.toString();
      } catch (e) {}
    }

    // We no longer normalize HubCloud domains to .cx to support dynamic domains
    window.open(url, "_blank", "noopener,noreferrer");

    closeLinkPopup();
  };

  const contentGenres = genres
    .filter((g) => mergedContent.genreIds?.includes(g.id))
    .map((g) => g.name)
    .join(", ");
  const contentLangs = languages
    .filter((l) => mergedContent.languageIds?.includes(l.id))
    .map((l) => l.name)
    .join(", ");

  const getLinksArray = (linksData: any): QualityLinks => {
    if (!linksData) return [];
    if (Array.isArray(linksData)) return linksData;

    const parseObject = (obj: any) => {
      return Object.entries(obj)
        .map(([name, link]: [string, any], index) => ({
          id: `parsed-link-${index}`,
          name,
          url: link?.url || "",
          size: link?.size || "",
          unit: (link?.unit || "MB") as "MB" | "GB",
        }))
        .filter((l) => l.url);
    };

    if (typeof linksData === "object") {
      return parseObject(linksData);
    }

    if (typeof linksData === "string") {
      try {
        let parsed = JSON.parse(linksData);
        while (typeof parsed === "string") {
          parsed = JSON.parse(parsed);
        }
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === "object" && parsed !== null) {
          return parseObject(parsed);
        }
      } catch (e) {
        console.error("Failed to parse linksData", linksData, e);
      }
    }
    return [];
  };

  const renderLinks = (
    links: QualityLinks,
    isZip?: boolean,
    contextName?: string,
    isLocked?: boolean,
    seasonInfo?: { id: string; number: number; title?: string },
    episodeInfo?: { number: number; title: string },
    isMkv?: boolean,
  ) => {
    if (!Array.isArray(links)) return null;

    const validLinks = links.filter((l) => l && l.url);
    if (validLinks.length === 0) return null;

    const getBytes = (size: string, unit: string) => {
      const val = parseFloat(size) || 0;
      return unit === "GB" ? val * 1000 : val;
    };

    const sortedLinks = [...validLinks].sort(
      (a, b) => getBytes(a.size, a.unit) - getBytes(b.size, b.unit),
    );

    return (
      <div className="flex flex-wrap gap-3 justify-center">
        {sortedLinks.map((link, idx) => {
          const fullName = contextName
            ? `${contextName} - ${link.name}`
            : link.name;
          const linkKey = `${link.url}-${idx}-${contextName ? contextName.replace(/\s+/g, "-") : "movie"}`;

          const getFormattedTitle = (link: any) => {
            if (episodeInfo && seasonInfo) {
              return `${mergedContent?.title || ""} S${seasonInfo.number}E${episodeInfo.number}: ${episodeInfo.title} - ${link.name}`;
            } else if (isMkv && seasonInfo) {
              return `${mergedContent?.title || ""} Season ${seasonInfo.number} - ${link.name}`;
            } else if (isZip && seasonInfo) {
              return `${mergedContent?.title || ""} Season ${seasonInfo.number} - ${link.name}`;
            } else if (mergedContent?.type === "movie") {
              return `${mergedContent.title || ""} ${mergedContent.year || ""} - ${link.name}`.replace(
                "  ",
                " ",
              );
            }
            return `${mergedContent?.title || ""} - ${link.name}`;
          };
          const formattedTitle = getFormattedTitle(link);

          const normalizedTargetUrl = (() => {
            try {
              const u = new URL(link.url);
              const host = u.hostname.toLowerCase();
              if (host.includes('hubcould') || host.includes('hubcloud') || host.includes('vcloud')) {
                u.hostname = 'hubcloud.cx';
                return u.toString();
              } else if (host.includes('hubdrive')) {
                u.hostname = 'hubdrive.space';
                return u.toString();
              }
            } catch (e) {}
            return link.url;
          })();
          const isExtracting = extractingLinkId === link.url || extractingLinkId === normalizedTargetUrl;

          return (
            <div
              key={linkKey}
              className={`relative flex flex-col bg-gradient-to-br from-white via-zinc-50/80 to-emerald-500/5 dark:from-zinc-900 dark:via-zinc-900 dark:to-emerald-950/20 rounded-2xl p-4 border border-zinc-200/90 dark:border-zinc-800 shadow-md hover:shadow-xl hover:border-emerald-500/50 hover:scale-[1.01] transition-all flex-1 min-w-[250px] max-w-sm ${isLocked ? "opacity-75 grayscale-[0.2]" : ""}`}
            >
              <div className="flex items-center justify-between gap-2 mb-3.5">
                <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 bg-zinc-200/80 dark:bg-zinc-800/90 border border-zinc-300/50 dark:border-zinc-700/50 px-3 py-1 rounded-xl truncate max-w-[160px] shadow-2xs">
                  {link.name}
                </span>
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-xl shrink-0 shadow-2xs">
                  {isLocked ? "Locked" : `${link.size} ${link.unit}`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  disabled={isExtracting}
                  onClick={() =>
                    handlePlayClick(
                      link.url,
                      fullName,
                      link.id,
                      isZip,
                      link.tinyUrl,
                      isLocked,
                      seasonInfo,
                      formattedTitle,
                    )
                  }
                  className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-95 text-white py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold shadow-lg shadow-emerald-500/20 border border-emerald-400/30 transition-all cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                  title={isExtracting ? t("Extracting...") : isLocked ? "Locked" : "Play"}
                >
                  {isExtracting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isLocked ? (
                    <Lock className="w-4 h-4 text-amber-200" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                  <span>{isExtracting ? t("Extracting...") : isLocked ? "Locked" : "Play"}</span>
                </button>

                <button
                  disabled={isExtracting}
                  onClick={() =>
                    handlePlayClick(
                      link.url,
                      fullName,
                      link.id,
                      isZip,
                      link.tinyUrl,
                      isLocked,
                      seasonInfo,
                      formattedTitle,
                    )
                  }
                  className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-95 text-white py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold shadow-lg shadow-cyan-600/20 border border-cyan-400/30 transition-all cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                  title={isExtracting ? t("Extracting...") : isLocked ? "Locked" : "Download"}
                >
                  {isExtracting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isLocked ? (
                    <Lock className="w-4 h-4 text-amber-200" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>{isExtracting ? t("Extracting...") : isLocked ? "Locked" : "Download"}</span>
                </button>

                {link.url &&
                  (link.url.toLowerCase().includes("hubcloud") ||
                    link.url.toLowerCase().includes("hubcould") ||
                    link.url.toLowerCase().includes("hubdrive") ||
                    link.url.toLowerCase().includes("vcloud")) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isLocked) {
                          handlePlayClick(
                            link.url,
                            fullName,
                            link.id,
                            isZip,
                            link.tinyUrl,
                            isLocked,
                            seasonInfo,
                            formattedTitle,
                          );
                          return;
                        }
                        const targetUrl = (() => {
                          try {
                            const u = new URL(link.url);
                            const host = u.hostname.toLowerCase();
                            if (host.includes('hubcould') || host.includes('hubcloud') || host.includes('vcloud')) {
                              u.hostname = 'hubcloud.cx';
                              return u.toString();
                            } else if (host.includes('hubdrive')) {
                              u.hostname = 'hubdrive.space';
                              return u.toString();
                            }
                          } catch (e) {}
                          return link.url;
                        })();

                        setTelegramConfirmModal({
                          isOpen: true,
                          url: targetUrl,
                          id: linkKey,
                        });
                      }}
                      className="p-2.5 bg-[#24A1DE]/10 hover:bg-[#24A1DE]/20 text-[#24A1DE] border border-[#24A1DE]/30 rounded-xl transition-all active:scale-95 shrink-0 cursor-pointer shadow-sm"
                      title={isLocked ? "Locked" : "Download via Telegram"}
                      disabled={resolvingTgId === linkKey}
                    >
                      {isLocked ? (
                        <Lock className="w-4 h-4 text-amber-500" />
                      ) : resolvingTgId === linkKey ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const handleShare = () => {
    if (!mergedContent) return;
    vibrate(30);

    const contentQuality =
      qualities.find((q) => q.id === mergedContent.qualityId)?.name || "N/A";

    const baseText =
      `🎬 ${formatContentTitle(mergedContent)} (${mergedContent.year})\n\n` +
      `🗣️ Language: ${contentLangs || "N/A"}\n` +
      `🎭 Genre: ${contentGenres || "N/A"}\n` +
      `🖨️ Print Quality: ${contentQuality}\n\n` +
      `🔗 Watch here: https://MovizNow.com/${mergedContent.id}\n` +
      `📞 WhatsApp: ${(() => {
        let sn = settings?.supportNumber || "3363284466";
        if (sn.startsWith("92")) sn = "0" + sn.substring(2);
        else if (!sn.startsWith("0")) sn = "0" + sn;
        return sn;
      })()}`;

    setSharePreviewModal({
      isOpen: true,
      title: "Share Content",
      contentTitle: `${formatContentTitle(mergedContent)} (${mergedContent.year})`,
      posterUrl: mergedContent.posterUrl,
      text: baseText.trim(),
      shareSubject: `${formatContentTitle(mergedContent)} (${mergedContent.year})`,
    });
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
      <div className="relative min-h-[65vh] md:min-h-[75vh] w-full flex flex-col justify-end overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <img
            key={mergedContent.id + "-hero"}
            src={
              mergedContent.posterUrl ||
              settings?.defaultAppImage ||
              "https://picsum.photos/seed/movie/1920/1080"
            }
            alt={mergedContent.title}
            className="w-full h-full object-cover opacity-65 dark:opacity-55 scale-[1.02] blur-[1px] transition-all duration-700 brightness-95"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/75 to-black/40 dark:from-zinc-950 dark:via-zinc-950/80 dark:to-black/60" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-white dark:to-zinc-950 opacity-90 pointer-events-none" />
          <div className="absolute inset-0 bg-radial from-emerald-500/20 via-transparent to-transparent opacity-75 pointer-events-none" />
        </div>

        <div className="absolute top-0 left-0 w-full p-4 md:p-6 z-[100] pointer-events-none flex justify-between items-center">
          <button
            onClick={() => {
              sessionStorage.setItem("from_movie_details", "true");
              navigate("/");
            }}
            className="inline-flex items-center gap-2 text-white hover:text-emerald-400 bg-black/60 hover:bg-black/80 backdrop-blur-xl px-5 py-2.5 rounded-full transition-all duration-300 pointer-events-auto cursor-pointer border border-white/20 shadow-xl hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" /> <span className="font-semibold text-sm">{t('Back')}</span>
          </button>
          <div className="pointer-events-auto"></div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex items-end justify-center p-4 sm:p-8 pt-28 sm:pt-36 pb-6 w-full"
        >
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center md:items-end gap-6 sm:gap-10 text-center md:text-left w-full">
            <div className="relative group shrink-0 flex flex-col items-center">
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-3xl blur opacity-30 group-hover:opacity-75 transition duration-500"></div>
                <div 
                  className="relative w-44 sm:w-56 md:w-64 rounded-2xl shadow-2xl cursor-pointer hover:scale-[1.03] transition-all duration-300 border border-white/20 dark:border-zinc-800/80 aspect-[2/3] overflow-hidden group/poster"
                  onClick={handleOpenPosterLightbox}
                  title={t('View Full Poster & Gallery')}
                >
                  <img
                    key={mergedContent.id + "-poster"}
                    src={
                      mergedContent.posterUrl ||
                      settings?.defaultAppImage ||
                      "https://picsum.photos/seed/movie/400/600"
                    }
                    alt={mergedContent.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />

                  {/* Desktop Hover overlay */}
                  <div className="absolute inset-0 bg-black/65 opacity-0 group-hover/poster:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                    <div className="flex flex-col items-center gap-2.5 text-white transform scale-90 group-hover/poster:scale-100 transition-transform duration-300">
                      <div className="p-3 bg-emerald-500 text-white rounded-full shadow-lg shadow-emerald-500/40">
                        <Maximize2 className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-bold tracking-wider uppercase bg-black/75 px-3.5 py-1 rounded-full border border-white/20 shadow-md">
                        {t('View Poster & Gallery')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Floating & Shaking Big Label Popup with Dismiss (X) button */}
                <AnimatePresence>
                  {!isPosterHintDismissed && (
                    <motion.div
                      initial={{ opacity: 0, y: 15, scale: 0.9 }}
                      animate={{
                        opacity: 1,
                        y: [0, -6, 0, -4, 0, 0, 0],
                        x: [0, 0, -2, 2, -2, 2, -1, 1, 0, 0],
                        rotate: [0, 0, -2, 2, -2.5, 2.5, -1, 1, 0, 0],
                        scale: [1, 1.02, 1, 1.02, 1, 1, 1],
                      }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      transition={{
                        opacity: { duration: 0.3 },
                        y: { duration: 3.2, repeat: Infinity, ease: "easeInOut" },
                        x: { duration: 3.2, repeat: Infinity, ease: "easeInOut" },
                        rotate: { duration: 3.2, repeat: Infinity, ease: "easeInOut" },
                        scale: { duration: 3.2, repeat: Infinity, ease: "easeInOut" },
                      }}
                      className="absolute -bottom-6 inset-x-0 z-20 flex justify-center px-1 pointer-events-none"
                    >
                      <div 
                        onClick={handleOpenPosterLightbox}
                        className="pointer-events-auto group/hint cursor-pointer bg-zinc-950/95 hover:bg-zinc-900 border-2 border-emerald-400 text-white pl-3.5 pr-2 py-2 rounded-2xl shadow-2xl shadow-emerald-950/80 backdrop-blur-xl flex items-center gap-2.5 transition-all duration-300 hover:scale-[1.04] active:scale-95 ring-4 ring-emerald-500/25 animate-pulse"
                      >
                        <div className="relative p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shrink-0">
                          <ImageIcon className="w-4 h-4" />
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
                        </div>
                        <div className="flex flex-col text-left">
                          <span className="text-xs sm:text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5 whitespace-nowrap">
                            {t('Open Poster to View More')}
                            <Maximize2 className="w-3.5 h-3.5 text-emerald-400 opacity-80 group-hover/hint:opacity-100 animate-bounce" />
                          </span>
                          <span className="text-[10px] text-zinc-400 font-medium">
                            {t('Tap to expand HD gallery')}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsPosterHintDismissed(true);
                          }}
                          className="ml-1 p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/90 transition-colors border border-transparent hover:border-zinc-700 shrink-0"
                          title={t('Dismiss')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex-1 space-y-4">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                <span className="bg-emerald-500/90 hover:bg-emerald-500 text-white px-3.5 py-1 rounded-full text-xs font-extrabold uppercase tracking-widest shadow-lg shadow-emerald-500/20 backdrop-blur-md">
                  {mergedContent.type}
                </span>
                {mergedContent.year && (
                  <span className="bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 px-3 py-1 rounded-full text-xs font-bold border border-zinc-300 dark:border-zinc-700">
                    {mergedContent.year}
                  </span>
                )}
                {mergedContent.qualityId &&
                  (() => {
                    const qualityObj = qualities.find(
                      (q) => q.id === mergedContent.qualityId,
                    );
                    if (!qualityObj) return null;
                    return (
                      <span
                        className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-lg border border-white/20"
                        style={{
                          backgroundColor: qualityObj.color || "#10b981",
                          color: getContrastColor(
                            qualityObj.color || "#10b981",
                          ),
                        }}
                      >
                        {qualityObj.name}
                      </span>
                    );
                  })()}
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-zinc-900 dark:text-white leading-[1.1] tracking-tight drop-shadow-md">
                {formatContentTitle(mergedContent)}
              </h1>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5 pt-2">
                {(mergedContent.trailerUrl ||
                  (mergedContent.type === "series" &&
                    seasons.some((s) => s.trailerUrl))) && (
                  <button
                    onClick={() => {
                      if (allTrailers.length > 1) {
                        setIsTrailerSelectionOpen(true);
                      } else if (allTrailers.length === 1) {
                        setActiveTrailerUrl(allTrailers[0].url);
                        setIsTrailerPopupOpen(true);
                      }
                    }}
                    className={`${getYouTubeEmbedUrl(allTrailers[0]?.url || "") ? "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500" : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500"} text-white px-6 py-3.5 text-sm sm:text-base rounded-2xl font-bold flex items-center gap-2.5 transition-all duration-300 active:scale-95 border border-white/20 shadow-xl shadow-red-600/20`}
                  >
                    {getYouTubeEmbedUrl(allTrailers[0]?.url || "") ? (
                      <Youtube className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 fill-current" />
                    )}
                    <span>{t('Watch Trailer')}</span>
                  </button>
                )}
                {mergedContent.sampleUrl && (
                  <button
                    onClick={() =>
                      handlePlayClick(
                        mergedContent.sampleUrl!,
                        "Sample",
                        "sample",
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        `${mergedContent.title || ""} - Sample`,
                      )
                    }
                    className="bg-zinc-100 dark:bg-zinc-800/90 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-6 py-3.5 text-sm sm:text-base rounded-2xl font-bold flex items-center gap-2 transition-all active:scale-95 border border-zinc-300 dark:border-zinc-700 shadow-sm"
                  >
                    <Play className="w-5 h-5 fill-current text-emerald-500" /> <span>{t('Sample')}</span>
                  </button>
                )}
                {mergedContent.imdbLink && (
                  <a
                    href={mergedContent.imdbLink}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black px-5 py-3.5 text-sm sm:text-base rounded-2xl font-black flex items-center gap-2 transition-all shadow-lg active:scale-95"
                  >
                    IMDb
                  </a>
                )}
                
                {((profile?.status === 'pending' || profile?.status === 'expired') || !(hasUserRated || safeStorage.getItem('has_rated') === 'true' || profile?.reviewRewardClaimed)) && (
                  <Link
                    to="/reviews"
                    className="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-5 py-3.5 text-sm sm:text-base rounded-2xl font-bold flex items-center gap-2 transition-all hover:opacity-90 active:scale-95 shadow-lg"
                  >
                    <MessageCircle className="w-5 h-5" /> <span>{profile?.status === 'pending' || profile?.status === 'expired' ? t('Check Reviews') : t('Rate our app')}</span>
                  </Link>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleWatchLater}
                    disabled={isWatchLaterLoading}
                    className={`p-3.5 rounded-2xl border transition-all duration-300 ${profile?.watchLater?.includes(mergedContent.id) ? "bg-emerald-500/20 border-emerald-500 text-emerald-500 shadow-lg shadow-emerald-500/10" : "bg-zinc-100/80 dark:bg-zinc-900/80 backdrop-blur-md border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"} ${isWatchLaterLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                    title="Watch Later"
                  >
                    {isWatchLaterLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Clock className="w-5 h-5" />
                    )}
                  </button>

                  <button
                    onClick={toggleFavorite}
                    disabled={isFavoriteLoading}
                    className={`p-3.5 rounded-2xl border transition-all duration-300 ${profile?.favorites?.includes(mergedContent.id) ? "bg-red-500/20 border-red-500 text-red-500 shadow-lg shadow-red-500/10" : "bg-zinc-100/80 dark:bg-zinc-900/80 backdrop-blur-md border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"} ${isFavoriteLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                    title="Favorite"
                  >
                    {isFavoriteLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Heart
                        className={`w-5 h-5 ${profile?.favorites?.includes(mergedContent.id) ? "fill-current" : ""}`}
                      />
                    )}
                  </button>

                  <button
                    onClick={handleShare}
                    disabled={isShareLoading}
                    className={`p-3.5 rounded-2xl border bg-zinc-100/80 dark:bg-zinc-900/80 backdrop-blur-md border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-all duration-300 ${isShareLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                    title="Share"
                  >
                    {isShareLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Share2 className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {(profile?.role === "admin" || profile?.role === "owner") && (
                  <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
                    <button
                      onClick={() => setIsMediaModalOpen(true)}
                      className="px-5 py-3 text-sm rounded-2xl border bg-cyan-500/10 border-cyan-500/30 text-cyan-500 hover:bg-cyan-500/20 transition-all flex items-center gap-2 font-bold"
                      title="Fetch Media Data"
                    >
                      <Search className="w-4 h-4" />
                      <span className="hidden sm:inline">Fetch</span>
                    </button>
                    <Link
                      to={`/admin/content?edit=${mergedContent.id}`}
                      className="px-5 py-3 text-sm rounded-2xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20 transition-all flex items-center gap-2 font-bold"
                      title="Edit Content"
                    >
                      <Edit2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Edit</span>
                    </Link>
                    <button
                      onClick={() => setDeleteId(mergedContent.id)}
                      className="px-5 py-3 text-sm rounded-2xl border bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20 transition-all flex items-center gap-2 font-bold"
                      title="Delete Content"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main Content Area */}
      <PageTransition className="w-full">
      <div className="max-w-7xl mx-auto px-8 pt-0 pb-12">
        {!profile ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-6 rounded-2xl mb-8 flex items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <Lock className="w-6 h-6 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-lg mb-1">{t('Sign in required')}</h3>
                <p className="text-emerald-400 mb-0">
                  {t('Please sign in or log in to access links and watch this content.')}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                navigate("/login", { state: { from: location.pathname } })
              }
              className="bg-emerald-500 text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-emerald-600 transition-colors whitespace-nowrap"
            >
              {t('Log In')}
            </button>
          </div>
        ) : (
          !canPlay && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-6 rounded-2xl mb-8 flex items-start gap-4">
              <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-1">{t('Access Restricted')}</h3>
                <p className="text-red-400 mb-4">
                  {mergedContent.status === "selected_content"
                    ? t("You don't have access to this content. Contact Admin.")
                    : isPending
                      ? t("Your account activation is pending. Please Get Membership or Add any content to cart to activate your account.")
                      : isExpired
                        ? profile?.role === "trial"
                          ? t("Your free Trial has expired. Please get Membership to continue watching.")
                          : t("Your membership has expired.")
                        : t("You do not have permission to access links for this content.")}
                </p>
                <div className="flex flex-wrap gap-3">
                  {isPending && (
                    <Link
                      to="/rewards"
                      className="inline-flex items-center gap-2 bg-emerald-500 text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                    >
                      <Gift className="w-5 h-5" />
                      {t('Rewards')}
                    </Link>
                  )}
                  {settings?.isAdminContactEnabled !== false && (
                    <button
                      onClick={() => {
                        let supportPhone =
                          settings?.supportNumber || "3363284466";
                        if (supportPhone.startsWith("0")) {
                          supportPhone = "92" + supportPhone.substring(1);
                        } else if (!supportPhone.startsWith("92")) {
                          supportPhone = "92" + supportPhone;
                        }
                        const adminPhone = supportPhone.replace("+", "");
                        const seasonText =
                          mergedContent?.type === "series"
                            ? " (Full Series)"
                            : "";
                        const contentTitle = mergedContent?.title + seasonText;
                        const isSCO = mergedContent?.status === "selected_content";
                        const scoPrefix = isSCO ? "(SCO) " : "";
                        const helpText =
                          profile?.role === "selected_content"
                            ? `I want to get access to ${scoPrefix}${contentTitle}. Please tell me how to pay and add it to my account.`
                            : `I cannot access ${scoPrefix}${contentTitle}.`;
                        const msg = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || "N/A"}\n${t("Phone")}: ${profile?.phone || "N/A"}\n${t("Role & Status")}: ${String(
                          profile?.role || "Unknown",
                        )
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) =>
                            c.toUpperCase(),
                          )}, ${String(profile?.status || "Unknown").replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${t("Your message/question:")}\n${helpText}`;
                        window.open(
                          `https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`,
                          "_blank",
                        );
                      }}
                      className="inline-flex items-center gap-2 bg-red-500/20 px-6 py-3 text-sm sm:text-base rounded-xl font-medium hover:bg-red-500/30 transition-colors text-red-500"
                    >
                      <MessageCircle className="w-5 h-5" /> {t('Contact Admin')} (
                      {(settings?.supportNumber || "03363284466").startsWith(
                        "0",
                      )
                        ? settings?.supportNumber || "03363284466"
                        : `0${settings?.supportNumber || "3363284466"}`}
                      )
                    </button>
                  )}
                  {(profile?.status === "pending" ||
                    profile?.status === "expired" ||
                    (profile?.status !== "active" && !hasFullAccess)) &&
                    mergedContent?.type === "movie" &&
                    (cart.some(
                      (item) => item.contentId === mergedContent.id,
                    ) ? (
                      <Link
                        to="/cart"
                        className="inline-flex items-center gap-2 bg-emerald-500 text-white px-6 py-3 text-sm sm:text-base rounded-xl font-medium hover:bg-emerald-600 transition-colors"
                      >
                        <ShoppingCart className="w-5 h-5 fill-current" />
                        {t('View Cart')}
                      </Link>
                    ) : (
                      <button
                        onClick={() => {
                          const basePrice = settings?.movieFee || 50;
                          const finalPrice = mergedContent.status === "selected_content" ? basePrice * 2 : basePrice;
                          addToCart({
                            contentId: mergedContent.id,
                            title: mergedContent.title,
                            type: "movie",
                            price: finalPrice,
                          });
                        }}
                        className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-500 px-6 py-3 text-sm sm:text-base rounded-xl font-medium hover:bg-emerald-500/30 transition-colors"
                      >
                        <ShoppingCart className="w-5 h-5" />
                        {t('Add to Cart')} (Rs {mergedContent.status === "selected_content" ? (settings?.movieFee || 50) * 2 : (settings?.movieFee || 50)})
                      </button>
                    ))}
                  {(profile?.status === "pending" ||
                    profile?.status === "expired" ||
                    (profile?.status !== "active" && !hasFullAccess)) &&
                    mergedContent?.type === "series" && (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 w-full mt-2 italic">
                        Scroll down to add specific seasons to your cart.
                      </p>
                    )}
                  {mergedContent?.status !== "selected_content" &&
                    (isExpired ||
                      isPending ||
                      profile?.role === "trial" ||
                      profile?.role === "user") && (
                      <Link
                        to="/top-up"
                        className="inline-flex items-center gap-2 bg-emerald-500 text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                      >
                        {isExpired
                          ? profile?.role === "trial"
                            ? t("Buy Membership")
                            : t("Renew Now")
                          : t("Get Membership")}
                      </Link>
                    )}
                </div>
              </div>
            </div>
          )
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section>
              {displayData ? (
                <div className="bg-gradient-to-br from-white/95 via-zinc-50/90 to-cyan-500/10 dark:from-zinc-900/95 dark:via-zinc-950 dark:to-cyan-950/40 border border-cyan-500/30 dark:border-cyan-500/20 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
                  <div className="absolute -top-12 -right-12 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="flex-1 space-y-5">
                    <div className="relative flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-bold text-cyan-500 uppercase tracking-widest">
                          <Film className="w-4 h-4" /> {mergedContent.type === 'series' ? 'Series Specifications' : 'Movie Specifications'}
                        </div>
                        <h3 className="text-2xl sm:text-3xl font-black text-cyan-950 dark:text-cyan-300 leading-tight">
                          {displayData.title}{" "}
                          {displayData.year ? `(${displayData.year})` : ""}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {displayData.rating && (
                          <div className="bg-[#f5c518] text-black px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-black text-xs sm:text-sm shadow-[0_0_20px_rgba(245,197,24,0.4)] whitespace-nowrap">
                            <span className="bg-black text-[#f5c518] px-1.5 py-0.5 rounded text-[10px] font-extrabold tracking-tighter">
                              IMDb
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-xs">⭐</span>
                              <span>
                                {displayData.rating.replace("/10", "")}
                              </span>
                            </div>
                          </div>
                        )}
                        {fetchingImdb && (
                          <RefreshCw className="w-4 h-4 text-cyan-500 animate-spin" />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                      {displayData.releaseDate && (
                        <div className="bg-white/80 dark:bg-zinc-900/80 border border-cyan-500/15 rounded-2xl p-3 flex flex-col shadow-sm">
                          <span className="text-zinc-400 dark:text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-cyan-500" /> Release Date
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold text-zinc-800 dark:text-zinc-200">
                            {formatReleaseDate(displayData.releaseDate)}
                          </span>
                        </div>
                      )}
                      {displayData.duration &&
                        mergedContent.type !== "series" && (
                          <div className="bg-white/80 dark:bg-zinc-900/80 border border-cyan-500/15 rounded-2xl p-3 flex flex-col shadow-sm">
                            <span className="text-zinc-400 dark:text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-cyan-500" /> Runtime
                            </span>
                            <span className="text-xs sm:text-sm font-extrabold text-zinc-800 dark:text-zinc-200">
                              {formatRuntime(displayData.duration)}
                            </span>
                          </div>
                        )}
                      {displayData.country &&
                        !displayData.country.includes(",") && (
                          <div className="bg-white/80 dark:bg-zinc-900/80 border border-cyan-500/15 rounded-2xl p-3 flex flex-col shadow-sm">
                            <span className="text-zinc-400 dark:text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                              <Globe className="w-3 h-3 text-cyan-500" /> Country
                            </span>
                            <span className="text-xs sm:text-sm font-extrabold text-zinc-800 dark:text-zinc-200 truncate">
                              {displayData.country}
                            </span>
                          </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-3 pt-3 border-t border-cyan-500/15">
                      {displayData.country &&
                        displayData.country.includes(",") && (
                          <div className="flex items-center gap-2 text-xs sm:text-sm">
                            <span className="text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider text-[11px] w-20 shrink-0">
                              Country
                            </span>
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                              {displayData.country}
                            </span>
                          </div>
                        )}
                      {displayData.ottPlatform && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm">
                          <span className="text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider text-[11px] w-20 shrink-0">
                            OTT
                          </span>
                          <OttBadge platform={displayData.ottPlatform} className="px-2.5 py-1 text-xs" />
                        </div>
                      )}
                      {mergedContent.qualityId && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm">
                          <span className="text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider text-[11px] w-20 shrink-0">
                            Quality
                          </span>
                          <span 
                            className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold text-cyan-700 bg-cyan-500/10 dark:text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all cursor-pointer underline underline-offset-2 decoration-cyan-500/60 hover:decoration-cyan-400"
                            onClick={() => handleFilterNavigation("home_quality", mergedContent.qualityId || "")}
                          >
                            {displayData.quality}
                          </span>
                        </div>
                      )}
                      {mergedContent.genreIds && mergedContent.genreIds.length > 0 && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm">
                          <span className="text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider text-[11px] w-20 shrink-0">
                            Genre
                          </span>
                          <div className="flex gap-1.5 flex-wrap">
                            {mergedContent.genreIds.map((id) => {
                               const g = genres.find(genre => genre.id === id);
                               if (!g) return null;
                               return (
                                 <span 
                                   key={id} 
                                   className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer underline underline-offset-2 decoration-emerald-500/60 hover:decoration-emerald-400"
                                   onClick={() => handleFilterNavigation("home_genre", id)}
                                 >
                                   {g.name}
                                 </span>
                               );
                            })}
                          </div>
                        </div>
                      )}
                      {mergedContent.languageIds && mergedContent.languageIds.length > 0 && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm">
                          <span className="text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider text-[11px] w-20 shrink-0">
                            Language
                          </span>
                          <div className="flex gap-1.5 flex-wrap">
                            {mergedContent.languageIds.map((id) => {
                               const l = languages.find(lang => lang.id === id);
                               if (!l) return null;
                               return (
                                 <span 
                                   key={id} 
                                   className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all cursor-pointer underline underline-offset-2 decoration-cyan-500/60 hover:decoration-cyan-400"
                                   onClick={() => handleFilterNavigation("home_language", id)}
                                 >
                                   {l.name}
                                 </span>
                               );
                            })}
                          </div>
                        </div>
                      )}
                      {mergedContent.subtitles && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm">
                          <span className="text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider text-[11px] w-20 shrink-0">
                            Subtitle
                          </span>
                          <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg">
                            Yes
                          </span>
                        </div>
                      )}
                    </div>

                    {displayData.castArray &&
                      displayData.castArray.length > 0 && (
                        <div className="pt-2">
                          <h4 className="text-xs font-extrabold text-cyan-700 dark:text-cyan-400 mb-2 uppercase tracking-wider opacity-80">
                            Cast
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {displayData.castArray.map((actor, idx) => (
                              <span
                                key={`display-cast-${actor}-${idx}`}
                                className="bg-white/80 dark:bg-zinc-900/80 border border-cyan-500/15 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 shadow-sm"
                              >
                                {actor}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    {(displayData.description || mergedContent.description) && (
                      <div className="pt-2 border-t border-cyan-500/15">
                        <h4 className="text-xs font-extrabold text-cyan-700 dark:text-cyan-400 mb-1.5 uppercase tracking-wider opacity-80">
                          {t('Synopsis')}
                        </h4>
                        <div 
                          dir={language === 'ur' ? 'rtl' : 'ltr'}
                          className={`text-zinc-600 dark:text-zinc-300 leading-relaxed ${language === 'ur' || language === 'ur-roman' ? 'text-base sm:text-lg font-medium' : 'text-xs sm:text-sm'}`}
                        >
                          <Translate
                            loadingFallback={
                              <div className="flex flex-col gap-2 animate-pulse py-1">
                                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-full"></div>
                                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-5/6"></div>
                                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-4/6"></div>
                              </div>
                            }
                          >
                            {displayData.description || mergedContent.description}
                          </Translate>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-12">
                  <section className="bg-gradient-to-br from-white/95 via-zinc-50/90 to-cyan-500/10 dark:from-zinc-900/95 dark:via-zinc-950 dark:to-cyan-950/40 border border-cyan-500/30 dark:border-cyan-500/20 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
                    <div className="relative mb-6 flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-bold text-cyan-500 uppercase tracking-widest">
                          <Film className="w-4 h-4" /> {mergedContent.type === 'series' ? 'Series Specifications' : 'Movie Specifications'}
                        </div>
                        <h3 className="text-2xl sm:text-3xl font-black text-cyan-950 dark:text-cyan-300 leading-tight">
                          {formatContentTitle(mergedContent)}
                        </h3>
                      </div>
                      {mergedContent.imdbRating && (
                        <div className="bg-[#f5c518] text-black px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-black text-xs sm:text-sm shadow-[0_0_20px_rgba(245,197,24,0.4)] whitespace-nowrap shrink-0">
                          <span className="bg-black text-[#f5c518] px-1.5 py-0.5 rounded text-[10px] font-extrabold tracking-tighter">
                            IMDb
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs">⭐</span>
                            <span>
                              {mergedContent.imdbRating.replace("/10", "")}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                      {mergedContent.year && (
                        <div className="bg-white/80 dark:bg-zinc-900/80 border border-cyan-500/15 rounded-2xl p-3 flex flex-col shadow-sm">
                          <span className="text-zinc-400 dark:text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-cyan-500" /> Year
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold text-zinc-800 dark:text-zinc-200">
                            {mergedContent.year}
                          </span>
                        </div>
                      )}
                      {mergedContent.releaseDate && (
                        <div className="bg-white/80 dark:bg-zinc-900/80 border border-cyan-500/15 rounded-2xl p-3 flex flex-col shadow-sm">
                          <span className="text-zinc-400 dark:text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                            <Film className="w-3 h-3 text-cyan-500" /> Release Date
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold text-zinc-800 dark:text-zinc-200">
                            {formatReleaseDate(mergedContent.releaseDate)}
                          </span>
                        </div>
                      )}
                      {mergedContent.runtime &&
                        mergedContent.type !== "series" && (
                          <div className="bg-white/80 dark:bg-zinc-900/80 border border-cyan-500/15 rounded-2xl p-3 flex flex-col shadow-sm">
                            <span className="text-zinc-400 dark:text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-cyan-500" /> Runtime
                            </span>
                            <span className="text-xs sm:text-sm font-extrabold text-zinc-800 dark:text-zinc-200">
                              {formatRuntime(mergedContent.runtime)}
                            </span>
                          </div>
                        )}
                      {mergedContent.country && (
                        <div className="bg-white/80 dark:bg-zinc-900/80 border border-cyan-500/15 rounded-2xl p-3 flex flex-col shadow-sm">
                          <span className="text-zinc-400 dark:text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                            <Globe className="w-3 h-3 text-cyan-500" /> Country
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold text-zinc-800 dark:text-zinc-200 truncate">
                            {mergedContent.country}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 pt-3 border-t border-cyan-500/15 mb-6">
                      {mergedContent.genreIds && mergedContent.genreIds.length > 0 && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm">
                          <span className="text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider text-[11px] w-20 shrink-0">
                            Genre
                          </span>
                          <div className="flex gap-1.5 flex-wrap">
                            {mergedContent.genreIds.map((id) => {
                               const g = genres.find(genre => genre.id === id);
                               if (!g) return null;
                               return (
                                 <span 
                                   key={id}
                                   className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer underline underline-offset-2 decoration-emerald-500/60 hover:decoration-emerald-400"
                                   onClick={() => handleFilterNavigation("home_genre", id)}
                                 >
                                   {g.name}
                                 </span>
                               );
                            })}
                          </div>
                        </div>
                      )}
                      {mergedContent.languageIds && mergedContent.languageIds.length > 0 && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm">
                          <span className="text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider text-[11px] w-20 shrink-0">
                            Language
                          </span>
                          <div className="flex gap-1.5 flex-wrap">
                            {mergedContent.languageIds.map((id) => {
                               const l = languages.find(lang => lang.id === id);
                               if (!l) return null;
                               return (
                                 <span 
                                   key={id}
                                   className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all cursor-pointer underline underline-offset-2 decoration-cyan-500/60 hover:decoration-cyan-400"
                                   onClick={() => handleFilterNavigation("home_language", id)}
                                 >
                                   {l.name}
                                 </span>
                               );
                            })}
                          </div>
                        </div>
                      )}
                      {mergedContent.qualityId &&
                        (() => {
                          const qualityObj = qualities.find(
                            (q) => q.id === mergedContent.qualityId,
                          );
                          if (!qualityObj) return null;
                          return (
                            <div className="flex items-center gap-2 text-xs sm:text-sm">
                              <span className="text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider text-[11px] w-20 shrink-0">
                                Quality
                              </span>
                              <button
                                onClick={() => {
                                  handleFilterNavigation("home_quality", mergedContent.qualityId || "");
                                }}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold shadow-md transition-transform hover:scale-105 select-none text-xs underline underline-offset-2 decoration-white/60 hover:decoration-white cursor-pointer"
                                style={{
                                  backgroundColor: qualityObj.color || "#10b981",
                                  color: getContrastColor(
                                    qualityObj.color || "#10b981",
                                  ),
                                }}
                              >
                                {qualityObj.name}
                              </button>
                            </div>
                          );
                        })()}
                    </div>

                    {mergedContent.cast && mergedContent.cast.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-xs font-extrabold text-cyan-700 dark:text-cyan-400 mb-2 uppercase tracking-wider opacity-80">
                          Cast
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {mergedContent.cast.map((actor, idx) => (
                            <span
                              key={`cast-${actor}-${idx}`}
                              className="bg-white/80 dark:bg-zinc-900/80 border border-cyan-500/15 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 shadow-sm"
                            >
                              {actor}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <h4 className="text-xs font-extrabold mb-1.5 text-cyan-700 dark:text-cyan-400 uppercase tracking-wider opacity-80">
                      {t('Synopsis')}
                    </h4>
                    <div 
                      dir={language === 'ur' ? 'rtl' : 'ltr'}
                      className={`text-zinc-600 dark:text-zinc-300 leading-relaxed ${language === 'ur' || language === 'ur-roman' ? 'text-base sm:text-lg font-medium' : 'text-xs sm:text-sm'}`}
                    >
                      <Translate
                        loadingFallback={
                          <div className="flex flex-col gap-2 animate-pulse py-1">
                            <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-full"></div>
                            <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-5/6"></div>
                            <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-4/6"></div>
                          </div>
                        }
                      >
                        {mergedContent.description}
                      </Translate>
                    </div>
                  </section>
                </div>
              )}
            </section>

            {/* Guest / Pending Access Banner */}
            <GuestAccessBanner className="my-6" />

            {/* Ad Banner for Basic Users */}
            <AdBanner className="my-6" />

            {/* Links Section */}
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-500">
                  <Download className="w-6 h-6" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{t('Download & Play')}</h2>
              </div>

              {mergedContent.type === "movie" &&
                mergedContent.movieLinks &&
                (() => {
                  try {
                    const links = getLinksArray(mergedContent.movieLinks);
                    const rendered = renderLinks(
                      links,
                      false,
                      undefined,
                      !canPlay,
                    );
                    if (!rendered) return null;
                    return (
                      <div className="bg-gradient-to-br from-zinc-50 via-white to-zinc-100/60 dark:from-zinc-900/90 dark:via-zinc-900 dark:to-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-xl">
                        <div className="flex items-center justify-between mb-5 pb-3 border-b border-zinc-200/80 dark:border-zinc-800/80">
                          <h3 className="font-extrabold text-base sm:text-lg text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                            <Film className="w-5 h-5 text-emerald-500" /> {t('Movie Links')}
                          </h3>
                          <span className="text-xs font-semibold text-zinc-500 bg-zinc-200/80 dark:bg-zinc-800 px-3 py-1 rounded-full">
                            {links.length} {links.length === 1 ? 'Option' : 'Options'}
                          </span>
                        </div>
                        {rendered}
                      </div>
                    );
                  } catch (e) {
                    console.error("Error parsing movie links:", e);
                    return null;
                  }
                })()}

              {mergedContent.type === "series" && mergedContent.seasons && (
                <div className="space-y-6">
                  {(() => {
                    try {
                      const allSeasons = Array.isArray(mergedContent.seasons)
                        ? mergedContent.seasons
                        : JSON.parse(mergedContent.seasons || "[]");
                      const sortedSeasons = [...allSeasons].sort(
                        (a: Season, b: Season) => {
                          const aAccess =
                            hasFullAccess || allowedSeasons.includes(a.id);
                          const bAccess =
                            hasFullAccess || allowedSeasons.includes(b.id);
                          if (aAccess && !bAccess) return -1;
                          if (!aAccess && bAccess) return 1;
                          return a.seasonNumber - b.seasonNumber;
                        },
                      );

                      return sortedSeasons.map((season: Season, sIdx) => {
                        const isAccessible =
                          hasFullAccess || allowedSeasons.includes(season.id);

                        return (
                          <div
                            key={season.id || `season-${sIdx}`}
                            className={`bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden ${!isAccessible && profile ? "opacity-75" : ""}`}
                          >
                            <div className="bg-white/50 dark:bg-zinc-950/50 p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                              <h3 className="text-xl font-bold">
                                Season {season.seasonNumber}{" "}
                                {season.title ? (
                                  <>
                                    - <Translate loadingFallback={<div className="h-5 bg-zinc-200 dark:bg-zinc-800 rounded w-32 animate-pulse inline-block align-middle ml-1"></div>}>{season.title}</Translate>
                                  </>
                                ) : (
                                  ""
                                )}
                                {season.year && (
                                  <span className="text-sm text-zinc-500 ml-2">
                                    ({season.year})
                                  </span>
                                )}
                              </h3>
                              <div className="flex flex-wrap items-center gap-3">
                                {!isAccessible && profile && (
                                  <>
                                    <span
                                      className={`${isPending ? "bg-amber-500/10 text-amber-500" : "bg-red-500/10 text-red-500"} px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2`}
                                    >
                                      <Lock className="w-4 h-4" />{" "}
                                      {isPending ? "Pending" : "Restricted"}
                                    </span>
                                    {(profile?.status === "pending" ||
                                      profile?.status === "expired" ||
                                      (profile?.status !== "active" && !hasFullAccess)) &&
                                      (cart.some(
                                        (item) =>
                                          item.contentId === mergedContent.id &&
                                          item.seasonId === season.id,
                                      ) ? (
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
                                            const basePrice = settings?.seasonFee || 100;
                                            const finalPrice = mergedContent.status === "selected_content" ? basePrice * 2 : basePrice;
                                            addToCart({
                                              contentId: mergedContent.id,
                                              title: `${mergedContent.title} - Season ${season.seasonNumber}${season.title ? ` (${season.title})` : ""}`,
                                              type: "season",
                                              seasonId: season.id,
                                              seasonNumber: season.seasonNumber,
                                              price: finalPrice,
                                            });
                                          }}
                                          className="bg-emerald-500/20 text-emerald-500 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-emerald-500/30 transition-colors"
                                        >
                                          <ShoppingCart className="w-4 h-4" />
                                          {t('Add to Cart')} (Rs{" "}
                                          {mergedContent.status === "selected_content" ? (settings?.seasonFee || 100) * 2 : (settings?.seasonFee || 100)})
                                        </button>
                                      ))}
                                    {mergedContent?.status !== "selected_content" &&
                                      (profile?.role === "trial" ||
                                        profile?.role === "user") && (
                                        <Link
                                          to="/top-up"
                                          className="bg-emerald-500/20 text-emerald-500 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-emerald-500/30 transition-colors"
                                        >
                                          {t('Top Up Membership')}
                                        </Link>
                                      )}
                                    {settings?.isAdminContactEnabled !== false && (
                                      <button
                                        onClick={() => {
                                          let supportPhone =
                                            settings?.supportNumber || "3363284466";
                                          if (supportPhone.startsWith("0")) {
                                            supportPhone = "92" + supportPhone.substring(1);
                                          } else if (!supportPhone.startsWith("92")) {
                                            supportPhone = "92" + supportPhone;
                                          }
                                          const adminPhone = supportPhone.replace("+", "");
                                          const contentTitle = `${mergedContent?.title} - Season ${season.seasonNumber}${season.title ? ` (${season.title})` : ""}`;
                                          const isSCO = mergedContent?.status === "selected_content";
                                          const scoPrefix = isSCO ? "(SCO) " : "";
                                          const helpText =
                                            profile?.role === "selected_content"
                                              ? `I want to get access to ${scoPrefix}${contentTitle}. Please tell me how to pay and add it to my account.`
                                              : `I cannot access ${scoPrefix}${contentTitle}.`;
                                          const msg = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || "N/A"}\n${t("Phone")}: ${profile?.phone || "N/A"}\n${t("Role & Status")}: ${String(
                                            profile?.role || "Unknown",
                                          )
                                            .replace(/_/g, " ")
                                            .replace(/\b\w/g, (c) =>
                                              c.toUpperCase(),
                                            )}, ${String(profile?.status || "Unknown").replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${t("Your message/question:")}\n${helpText}`;
                                          window.open(
                                            `https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`,
                                            "_blank",
                                          );
                                        }}
                                        className="bg-red-500/20 text-red-500 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-red-500/30 transition-colors"
                                      >
                                        <MessageCircle className="w-4 h-4" /> {t("Admin")}
                                      </button>
                                    )}
                                  </>
                                )}
                                {!profile && (
                                  <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2">
                                    <Lock className="w-4 h-4" /> Sign in to
                                    watch
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="p-6 space-y-8">
                              {(() => {
                                const zipLinks = getLinksArray(season.zipLinks);
                                const mkvLinks = getLinksArray(season.mkvLinks);

                                return (
                                  <>
                                    {zipLinks.length > 0 && (
                                      <div>
                                        <h4 className="font-semibold text-zinc-500 dark:text-zinc-400 mb-3 text-sm uppercase tracking-wider">
                                          Full Season Zip
                                        </h4>
                                        {renderLinks(
                                          zipLinks,
                                          true,
                                          `S${season.seasonNumber} Zip`,
                                          !isAccessible,
                                          {
                                            id: season.id,
                                            number: season.seasonNumber,
                                            title: season.title,
                                          },
                                        )}
                                      </div>
                                    )}
                                    {mkvLinks.length > 0 && (
                                      <div>
                                        <h4 className="font-semibold text-zinc-500 dark:text-zinc-400 mb-3 text-sm uppercase tracking-wider">
                                          Full Season MKV
                                        </h4>
                                        {renderLinks(
                                          mkvLinks,
                                          false,
                                          `S${season.seasonNumber} MKV`,
                                          !isAccessible,
                                          {
                                            id: season.id,
                                            number: season.seasonNumber,
                                            title: season.title,
                                          },
                                          undefined,
                                          true,
                                        )}
                                      </div>
                                    )}

                                    {season.episodes &&
                                      season.episodes.filter(
                                        (ep) =>
                                          getLinksArray(ep.links).length > 0,
                                      ).length > 0 && (
                                        <div>
                                          <h4 className="font-semibold text-zinc-500 dark:text-zinc-400 mb-4 text-sm uppercase tracking-wider">
                                            Episodes
                                          </h4>
                                          <div className="space-y-4">
                                            {season.episodes
                                              .filter(
                                                (ep) =>
                                                  getLinksArray(ep.links)
                                                    .length > 0,
                                              )
                                              .map((ep, eIdx) => {
                                                const isGenericTitle = /^episode\s+\d+$/i.test(ep.title?.trim() || "");
                                                return (
                                                  <div
                                                    key={ep.id || `ep-${eIdx}`}
                                                    className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col gap-4"
                                                  >
                                                    <div className="flex flex-col gap-2">
                                                      <div className="flex items-center flex-wrap gap-2">
                                                        <span className="text-emerald-500 font-bold">
                                                          E{ep.episodeNumber}
                                                        </span>
                                                        <span className="font-medium">
                                                          {isGenericTitle ? ep.title : <Translate loadingFallback={<div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-32 animate-pulse inline-block align-middle"></div>}>{ep.title}</Translate>}
                                                        </span>
                                                        <button
                                                          onClick={() =>
                                                            setExpandedEpisodes(
                                                              (prev) => ({
                                                                ...prev,
                                                                [`${season.id}-${ep.id}`]:
                                                                  !prev[`${season.id}-${ep.id}`],
                                                              }),
                                                            )
                                                          }
                                                          className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-emerald-500 transition-colors"
                                                        >
                                                          {expandedEpisodes[
                                                            `${season.id}-${ep.id}`
                                                          ] ? (
                                                            <ChevronUp className="w-4 h-4" />
                                                          ) : (
                                                            <ChevronDown className="w-4 h-4" />
                                                          )}
                                                        </button>
                                                        {ep.duration && (
                                                          <span className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded whitespace-nowrap">
                                                            {ep.duration}
                                                          </span>
                                                        )}
                                                      </div>

                                                      {expandedEpisodes[
                                                        `${season.id}-${ep.id}`
                                                      ] && ep.description && ep.description.trim() !== "" && ep.description !== ep.title && (
                                                        <div 
                                                          dir={language === 'ur' ? 'rtl' : 'ltr'}
                                                          className={`text-zinc-500 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50 p-3 rounded-lg ${language === 'ur' || language === 'ur-roman' ? 'text-base font-medium' : 'text-sm'}`}
                                                        >
                                                          <Translate
                                                            loadingFallback={
                                                              <div className="flex flex-col gap-2 animate-pulse py-1">
                                                                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-full"></div>
                                                                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-5/6"></div>
                                                                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-4/6"></div>
                                                              </div>
                                                            }
                                                          >
                                                            {ep.description}
                                                          </Translate>
                                                        </div>
                                                      )}
                                                    </div>

                                                    {getLinksArray(ep.links)
                                                      .length > 0 && (
                                                      <div className="flex justify-center">
                                                        {renderLinks(
                                                          getLinksArray(ep.links),
                                                          false,
                                                          `S${season.seasonNumber} E${ep.episodeNumber}`,
                                                          !isAccessible,
                                                          {
                                                            id: season.id,
                                                            number:
                                                              season.seasonNumber,
                                                            title: season.title,
                                                          },
                                                          {
                                                            number:
                                                              ep.episodeNumber,
                                                            title:
                                                              (ep as any).name ||
                                                              ep.title ||
                                                              `Episode ${ep.episodeNumber}`,
                                                          },
                                                        )}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                        </div>
                                      )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      });
                    } catch (e) {
                      console.error("Error parsing series seasons:", e);
                      return (
                        <p className="text-red-500">{t('Error loading seasons')}</p>
                      );
                    }
                  })()}
                </div>
              )}
            </section>

            <ContactSupportButtons content={mergedContent} />

            {/* Recommended Movies Section */}
            {recommendedMovies.length > 0 && (
              <div className="mt-10 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-cyan-500/10 dark:bg-cyan-500/20 border border-cyan-500/30 rounded-xl text-cyan-500 shadow-sm">
                      <Heart className="w-4 h-4 fill-cyan-500/30" />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
                        {t('Recommended For You')}
                      </h2>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {t('Handpicked recommendations matching this genre & quality')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 sm:p-5 shadow-sm overflow-hidden">
                  <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-zinc-50/50 dark:from-zinc-900/40 to-transparent z-10" />
                  <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-50/50 dark:from-zinc-900/40 to-transparent z-10" />

                  <div
                    className="flex overflow-x-auto gap-4 sm:gap-5 pb-1 pt-0.5 snap-x snap-mandatory hide-scrollbar scroll-smooth"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    {recommendedMovies.map((recContent, rmIdx) => (
                      <div
                        key={recContent.id || `rec-${rmIdx}`}
                        className="min-w-[170px] sm:min-w-[210px] md:min-w-[240px] snap-start hover:scale-[1.02] transition-transform duration-300"
                      >
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
      </PageTransition>

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
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 max-w-md w-full relative shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {adState?.isPlaying ? (
                <div className="absolute inset-0 bg-zinc-950 flex flex-col justify-between z-30 p-6 text-white animate-fade-in">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-extrabold uppercase bg-amber-500 text-black px-2 py-0.5 rounded-md tracking-wider">
                      Sponsor Video Ad
                    </span>
                    <span className="text-xs text-zinc-400 font-medium">
                      {adState.timeLeft > 0 ? `Skip in ${adState.timeLeft}s` : 'Ad Ready to Skip'}
                    </span>
                  </div>

                  {/* Video Player */}
                  <div className="relative flex-1 flex items-center justify-center bg-black rounded-xl overflow-hidden border border-zinc-800 my-2">
                    <video
                      src={settings?.adVideoUrl || 'https://assets.mixkit.co/videos/preview/mixkit-popcorn-machine-in-action-close-up-42289-large.mp4'}
                      autoPlay
                      playsInline
                      muted={adState.isMuted}
                      className="w-full h-full object-cover"
                      onEnded={() => setAdState(prev => prev ? { ...prev, timeLeft: 0, canSkip: true } : null)}
                    />
                    
                    {/* Sound Control Icon */}
                    <button
                      type="button"
                      onClick={() => setAdState(prev => prev ? { ...prev, isMuted: !prev.isMuted } : null)}
                      className="absolute bottom-3 right-3 p-2 bg-black/60 rounded-full hover:bg-black/80 transition-colors border border-white/10"
                    >
                      {adState.isMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
                    </button>
                  </div>

                  {/* Promotion Description and CTA */}
                  <div className="mt-3 space-y-4">
                    <div>
                      <h4 className="font-extrabold text-sm text-white line-clamp-1">
                        {settings?.adBannerTitle || 'MovizNow Premium Sponsor'}
                      </h4>
                      <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {settings?.adBannerDescription || 'Enjoy high quality premium streaming on MovizNow.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <a
                        href={settings?.adRedirectUrl || 'https://moviznow.app/premium'}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-100 text-black font-extrabold text-xs tracking-wide shadow-md transition-all active:scale-95 text-center"
                      >
                        Visit Sponsor
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>

                      <button
                        type="button"
                        onClick={() => setAdState(prev => prev ? { ...prev, isPlaying: false, hasCompleted: true } : null)}
                        disabled={!adState.canSkip}
                        className={clsx(
                          "px-4 py-2.5 rounded-xl font-extrabold text-xs tracking-wide transition-all shadow-md text-center flex items-center justify-center",
                          adState.canSkip 
                            ? "bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer active:scale-95" 
                            : "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50"
                        )}
                      >
                        {adState.canSkip ? 'Skip Ad' : `Skip in ${adState.timeLeft}s`}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <button
                onClick={closeLinkPopup}
                className="absolute top-5 right-5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800"
                disabled={extractingLinkId === linkPopup.url}
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-xl font-bold mb-2 text-zinc-900 dark:text-white">{t('Play Content')}</h3>
              <div className="flex justify-between items-center mb-6 gap-2">
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {t('How would you like to open')} <span dir="ltr" className="inline-block mx-1 font-bold text-zinc-900 dark:text-zinc-100">"{linkPopup.name}"</span>{language === 'ur' ? '؟' : '?'}
                </p>
                {linkPopup.size && (
                  <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-bold whitespace-nowrap">
                    {linkPopup.size}
                  </span>
                )}
              </div>

              {extractingLinkId === linkPopup.url && (
                <div className="absolute inset-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center rounded-3xl">
                  <Loader2 className="animate-spin h-9 w-9 text-emerald-500 mb-3" />
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">
                    {t('Extracting link...')}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {linkPopup.candidates && linkPopup.candidates.length > 0 && (
                  <div className="mb-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                      {t('Select Server')}:
                    </label>
                    <select
                      value={linkPopup.url}
                      onChange={(e) =>
                        setLinkPopup({ ...linkPopup, url: e.target.value })
                      }
                      className="w-full bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-3 text-sm font-medium text-zinc-900 dark:text-white outline-none ring-2 ring-transparent focus:ring-emerald-500 transition-all cursor-pointer"
                    >
                      {linkPopup.candidates.map((c, i) => (
                        <option key={i} value={c.href}>
                          {c.text
                            .replace(/download|download file/gi, "")
                            .trim() || `Server ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {!(
                  linkPopup.isZip ||
                  linkPopup.name.toLowerCase().includes("zip") ||
                  (linkPopup.url.toLowerCase().includes(".zip") &&
                    !linkPopup.url.toLowerCase().includes("vcloud.zip"))
                ) ? (
                  <>
                    <button
                      onClick={() => handlePlayExternal("generic")}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-6 text-sm sm:text-base rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                    >
                      <Play className="w-5 h-5 fill-current" /> {t('Play in Video Player')}
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handlePlayExternal("mx")}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm"
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-5 h-5 shrink-0"
                        >
                          <rect
                            width="24"
                            height="24"
                            rx="6"
                            fill="white"
                            fillOpacity="0.2"
                          />
                          <path
                            d="M16.5 12L9 16.5V7.5L16.5 12Z"
                            fill="currentColor"
                          />
                        </svg>
                        {t('MX Player')}
                      </button>
                      <button
                        onClick={() => handlePlayExternal("vlc")}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm"
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-5 h-5 shrink-0"
                        >
                          <path d="M12 2L5 22H19L12 2Z" fill="currentColor" />
                          <path
                            d="M6.5 17H17.5"
                            stroke="#ea580c"
                            strokeWidth="2.5"
                          />
                          <path
                            d="M9 10H15"
                            stroke="#ea580c"
                            strokeWidth="2.5"
                          />
                        </svg>
                        {t('VLC Player')}
                      </button>
                    </div>
                  </>
                ) : null}

                <button
                  onClick={() => {
                    if (!profile) {
                      setShowLoginPrompt(true);
                      return;
                    }
                    setShowReportConfirm(true);
                  }}
                  disabled={isReporting}
                  className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold py-3 px-6 text-sm rounded-xl transition-colors flex items-center justify-center gap-2 border border-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isReporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  {isReporting ? t("Sending...") : t("Report Link (if not Working)")}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handlePlayExternal("download")}
                    className="w-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-bold py-3 px-4 text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Copy className="w-4 h-4" /> {t('Copy Link')}
                  </button>

                  <button
                    onClick={handlePlayDirectly}
                    className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 px-4 text-sm rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Download
                  </button>
                </div>
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
            className="fixed inset-0 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between z-[100] p-4 sm:p-6 select-none"
            onClick={closePosterPopup}
            onTouchStart={handleLightboxTouchStart}
            onTouchMove={handleLightboxTouchMove}
            onTouchEnd={handleLightboxTouchEnd}
          >
            {/* Top Bar */}
            <div className="w-full max-w-5xl flex items-center justify-between z-10 pt-2 pb-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <span className="bg-emerald-500/90 text-white text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-md">
                  {allGalleryImages[activeGalleryIndex]?.label || 'Poster'}
                </span>
                <span className="text-zinc-300 text-sm font-bold">
                  {activeGalleryIndex + 1} / {allGalleryImages.length}
                </span>
                {loadingTmdbGallery && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('Fetching images...')}
                  </span>
                )}
              </div>
              <button
                onClick={closePosterPopup}
                className="text-zinc-400 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 p-2.5 rounded-full transition-all border border-zinc-800"
                title="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Main Stage with Full Size Portrait Image & Navigation */}
            <div
              className="relative flex-1 w-full max-w-5xl flex items-center justify-center my-auto min-h-0"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Previous Button */}
              {allGalleryImages.length > 1 && (
                <button
                  onClick={handlePrevGalleryImage}
                  className="absolute left-1 sm:left-4 z-30 bg-zinc-900/90 hover:bg-emerald-600 text-white p-3 rounded-full border border-zinc-700 shadow-2xl transition-all duration-200 active:scale-90"
                  title="Previous Image"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* Portrait Image Container */}
              <div className="relative max-h-[75vh] w-full flex items-center justify-center overflow-hidden rounded-2xl shadow-2xl border border-white/10 bg-zinc-950/80 p-2">
                {/* Loader Overlay */}
                {isLightboxImageLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/85 z-20 gap-3 backdrop-blur-sm">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
                    <span className="text-xs font-semibold text-zinc-300 animate-pulse">{t('Loading image...')}</span>
                  </div>
                )}

                <img
                  src={allGalleryImages[activeGalleryIndex]?.url}
                  alt={mergedContent?.title || 'Poster'}
                  className="max-h-[72vh] max-w-full object-contain rounded-xl aspect-[2/3] shadow-2xl transition-all duration-300"
                  referrerPolicy="no-referrer"
                  onLoad={() => setIsLightboxImageLoading(false)}
                  onError={() => setIsLightboxImageLoading(false)}
                />
              </div>

              {/* Next Button */}
              {allGalleryImages.length > 1 && (
                <button
                  onClick={handleNextGalleryImage}
                  className="absolute right-1 sm:right-4 z-30 bg-zinc-900/90 hover:bg-emerald-600 text-white p-3 rounded-full border border-zinc-700 shadow-2xl transition-all duration-200 active:scale-90"
                  title="Next Image"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>

            {/* Bottom Thumbnails Bar */}
            {allGalleryImages.length > 1 && (
              <div
                className="w-full max-w-4xl flex items-center justify-start gap-2 pt-3 pb-1 overflow-x-auto no-scrollbar z-10 px-4"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                {allGalleryImages.map((img, idx) => (
                  <button
                    key={`thumb-${idx}-${img.url}`}
                    onClick={() => {
                      if (idx !== activeGalleryIndex) {
                        setIsLightboxImageLoading(true);
                        setActiveGalleryIndex(idx);
                      }
                    }}
                    className={`relative shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-200 w-12 h-16 sm:w-14 sm:h-20 cursor-pointer ${
                      activeGalleryIndex === idx
                        ? 'border-emerald-400 dark:border-emerald-400 scale-105 shadow-lg shadow-emerald-500/30 opacity-100 ring-2 ring-emerald-500/50'
                        : 'border-zinc-500 dark:border-zinc-500 opacity-80 hover:opacity-100 hover:border-zinc-300'
                    }`}
                  >
                    <img
                      src={img.url}
                      alt={img.label}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ))}
              </div>
            )}
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
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 max-w-md w-full relative shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsTrailerSelectionOpen(false)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <h3 className="text-xl font-bold mb-4 text-zinc-900 dark:text-white">
                {t('Select Trailer')}
              </h3>
              <div className="flex flex-col gap-3">
                {allTrailers.map((trailer, idx) => {
                  const label =
                    trailer.title ||
                    (trailer.seasonNumber
                      ? `Season ${trailer.seasonNumber} Trailer`
                      : trailer.youtubeTitle || `Trailer ${idx + 1}`);
                  return (
                    <button
                      key={`trailer-select-${trailer.id}-${idx}`}
                      onClick={() => {
                        setActiveTrailerUrl(trailer.url);
                        setIsTrailerSelectionOpen(false);
                        // Use a small timeout to ensure state updates are processed
                        setTimeout(() => setIsTrailerPopupOpen(true), 50);
                      }}
                      className={`w-full font-bold py-3 px-6 text-base rounded-xl transition-colors flex items-center justify-between border ${
                        getYouTubeEmbedUrl(trailer.url)
                          ? "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20"
                          : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/20"
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
        {isTrailerPopupOpen &&
          (activeTrailerUrl || mergedContent.trailerUrl) && (
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
                onClick={(e) => e.stopPropagation()}
              >
                {getYouTubeEmbedUrl(
                  activeTrailerUrl || mergedContent.trailerUrl || "",
                ) ? (
                  <div className="w-full h-full relative group">
                    <iframe
                      src={`${getYouTubeEmbedUrl(activeTrailerUrl || mergedContent.trailerUrl || "")}?autoplay=1`}
                      title="Trailer"
                      className="w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                    <div className="absolute top-4 right-12 z-50">
                      <a
                        href={
                          activeTrailerUrl || mergedContent.trailerUrl || ""
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-black/80 transition-colors border border-white/10 shadow-lg flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Youtube className="w-3.5 h-3.5" />
                        {t('Open externally')}
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-900 dark:text-white gap-4 bg-zinc-50 dark:bg-zinc-900">
                    <Play className="w-16 h-16 opacity-50" />
                    <p>{t('This trailer cannot be played directly here.')}</p>
                    <a
                      href={activeTrailerUrl || mergedContent.trailerUrl || ""}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-emerald-500 hover:bg-emerald-600 px-6 py-3 text-sm sm:text-base rounded-xl font-bold transition-colors"
                    >
                      {t('Open in New Tab')}
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
        onConfirm={() =>
          navigate("/login", { state: { from: location.pathname } })
        }
        onCancel={() => setShowLoginPrompt(false)}
        confirmText="Log In"
        cancelText="Cancel"
      />
      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => {
          setAlertConfig((prev) => ({ ...prev, isOpen: false }));
          setLockedContentInfo(null);
        }}
        title={alertConfig.title}
        message={alertConfig.message}
      >
        {(alertConfig.title === t("Account Pending") ||
          alertConfig.title === t("Trial Expired") ||
          alertConfig.title === t("Membership Expired") ||
          alertConfig.title === t("Content Locked")) && (
          <div className="flex flex-col gap-3">
            {lockedContentInfo &&
              (profile?.status === "pending" ||
                profile?.status === "expired" ||
                (profile?.status !== "active" && !hasFullAccess)) &&
              (cart.some(
                (item) =>
                  item.contentId === lockedContentInfo.id &&
                  (lockedContentInfo.type === "movie" ||
                    item.seasonId === lockedContentInfo.seasonId),
              ) ? (
                <Link
                  to="/cart"
                  className="flex items-center justify-center gap-2 bg-emerald-500 text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <ShoppingCart className="w-5 h-5 fill-current" /> {t('View Cart')}
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
                      price: lockedContentInfo.price,
                    });
                    setLockedContentInfo(null);
                    setAlertConfig((prev) => ({ ...prev, isOpen: false }));
                  }}
                  className="flex items-center justify-center gap-2 bg-emerald-500 text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <ShoppingCart className="w-5 h-5" /> {t('Add to Cart')} (Rs{" "}
                  {lockedContentInfo.price})
                </button>
              ))}

            {mergedContent?.status !== "selected_content" &&
              (profile?.role === "trial" ||
                profile?.role === "user" ||
                isExpired) && (
                <Link
                  to="/top-up"
                  className="flex items-center justify-center gap-2 bg-emerald-500 text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                >
                  {isExpired
                    ? profile?.role === "trial"
                      ? t("Buy Membership")
                      : t("Renew Now")
                    : t("Get Membership")}
                </Link>
              )}

            {(profile?.role === "selected_content" ||
              profile?.role === "user") &&
              (!isExpired || mergedContent?.status === "selected_content") && (
                <Link
                  to="/cart"
                  className="flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all"
                >
                  <ShoppingCart className="w-5 h-5" /> Cart
                </Link>
              )}
            {settings?.isAdminContactEnabled !== false && (
              <a
                href={(() => {
                  let supportPhone = settings?.supportNumber || "3363284466";
                  if (supportPhone.startsWith("0")) {
                    supportPhone = "92" + supportPhone.substring(1);
                  } else if (!supportPhone.startsWith("92")) {
                    supportPhone = "92" + supportPhone;
                  }
                  const adminPhone = supportPhone.replace("+", "");
                  const seasonText =
                    lockedContentInfo?.type === "season" &&
                    lockedContentInfo.seasonNumber
                      ? ` Season ${lockedContentInfo.seasonNumber}`
                      : "";
                  const displayTitle =
                    (lockedContentInfo?.title ||
                      mergedContent?.title ||
                      "this content") + seasonText;
                  const isSCO = mergedContent?.status === "selected_content";
                  const scoPrefix = isSCO ? "(SCO) " : "";
                  const helpText =
                    profile?.role === "selected_content"
                      ? `I want to get access to ${scoPrefix}${displayTitle}. Please tell me how to pay and add it to my account.`
                      : `I need assistance with ${scoPrefix}${displayTitle}.`;
                  const message = encodeURIComponent(
                    `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || "N/A"}\n${t("Phone")}: ${profile?.phone || "N/A"}\n${t("Role & Status")}: ${String(
                      profile?.role || "Unknown",
                    )
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c) =>
                        c.toUpperCase(),
                      )}, ${String(profile?.status || "Unknown").replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${t("Your message/question:")}\n${helpText}`,
                  );
                  return `https://wa.me/${adminPhone}?text=${message}`;
                })()}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white px-6 py-3 text-sm sm:text-base rounded-xl font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all"
              >
                <MessageCircle className="w-5 h-5" /> {t("Admin")}
              </a>
            )}
          </div>
        )}
      </AlertModal>

      {telegramConfirmModal && (
        <AlertModal
          isOpen={telegramConfirmModal.isOpen}
          onClose={() => setTelegramConfirmModal(null)}
          title={t("Download via Telegram")}
          message={t("Are you sure you want to download this file via Telegram?")}
        >
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full mt-4">
            <button
              onClick={() => setTelegramConfirmModal(null)}
              className="w-full sm:flex-1 py-3 px-6 rounded-xl font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
            >
              {t('Cancel')}
            </button>
            <button
              onClick={() => {
                const tgId = telegramConfirmModal.id;
                const tgUrl = telegramConfirmModal.url;
                setTelegramConfirmModal(null);
                handleTelegramResolve(tgId, tgUrl);
              }}
              className="w-full sm:flex-1 py-3 px-6 rounded-xl font-bold bg-[#24A1DE] text-white hover:bg-[#1E8BC2] transition flex flex-row items-center justify-center gap-2"
            >
              <Send className="w-5 h-5 shrink-0" /> {t('Open in Telegram')}
            </button>
          </div>
        </AlertModal>
      )}

      {isMediaModalOpen && mergedContent && (
        <MediaModal
          isOpen={isMediaModalOpen}
          onClose={() => setIsMediaModalOpen(false)}
          onApply={async (data) => {
            try {
              const updateData: any = { ...data };

              // Map genre names to IDs if genres are provided
              if (data.genres && Array.isArray(data.genres)) {
                const matchedGenreIds: string[] = [];
                data.genres.forEach((gName: string) => {
                  const match = genres.find(
                    (g) => g.name.toLowerCase() === gName.toLowerCase(),
                  );
                  if (match) matchedGenreIds.push(match.id);
                });
                if (matchedGenreIds.length > 0) {
                  updateData.genreIds = matchedGenreIds;
                  delete updateData.genres;
                }
              }

              // Map cast string to array if provided
              if (data.cast && typeof data.cast === "string") {
                updateData.cast = data.cast
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter(Boolean);
              }

              // Handle seasons if they are in the data
              if (data.seasons && Array.isArray(data.seasons)) {
                let currentSeasons: any[] = [];
                try {
                  currentSeasons = JSON.parse(mergedContent.seasons || "[]");
                } catch (e) {
                  console.error("Error parsing seasons in onApply:", e);
                }

                data.seasons.forEach((fetchedSeason: any) => {
                  const existingSeasonIndex = currentSeasons.findIndex(
                    (s: any) => s.seasonNumber === fetchedSeason.seasonNumber,
                  );

                  if (existingSeasonIndex !== -1) {
                    const existingSeason = currentSeasons[existingSeasonIndex];
                    if (fetchedSeason.seasonYear)
                      existingSeason.year = fetchedSeason.seasonYear;

                    fetchedSeason.episodes.forEach((fetchedEp: any) => {
                      const existingEpIndex = existingSeason.episodes.findIndex(
                        (ep: any) =>
                          ep.episodeNumber === fetchedEp.episodeNumber,
                      );
                      if (existingEpIndex !== -1) {
                        existingSeason.episodes[existingEpIndex] = {
                          ...existingSeason.episodes[existingEpIndex],
                          title:
                            (!existingSeason.episodes[existingEpIndex].title ||
                              /^Episode\s+\d+$/i.test(
                                existingSeason.episodes[existingEpIndex].title,
                              )) &&
                            fetchedEp.title
                              ? fetchedEp.title
                              : existingSeason.episodes[existingEpIndex].title,
                          description:
                            fetchedEp.description ||
                            existingSeason.episodes[existingEpIndex]
                              .description,
                          duration:
                            fetchedEp.duration ||
                            existingSeason.episodes[existingEpIndex].duration,
                        };
                      }
                    });
                    existingSeason.episodes.sort(
                      (a: any, b: any) => a.episodeNumber - b.episodeNumber,
                    );
                  }
                });
                updateData.seasons = JSON.stringify(
                  currentSeasons.sort(
                    (a: any, b: any) => a.seasonNumber - b.seasonNumber,
                  ),
                );
              }

              await updateContentFields([
                {
                  id: mergedContent.id,
                  chunkId: mergedContent.chunkId,
                  fields: updateData,
                },
              ]);

              if (fullContent) {
                const updatedFullContent = { ...fullContent, ...updateData };
                setFullContent(updatedFullContent);
                safeStorage.setItemAsync(
                  `movie_details_${id}`,
                  JSON.stringify(updatedFullContent),
                );
              } else if (content) {
                const updatedContent = { ...content, ...updateData };
                safeStorage.setItemAsync(
                  `movie_details_${id}`,
                  JSON.stringify(updatedContent),
                );
              }

              // Update cachedMetadata with the new data to update UI instantly without network roundtrip
              setCachedMetadata((prev) => {
                const newCache = { ...prev.data, ...updateData };
                safeStorage.setItem(
                  `content_cache_${id}`,
                  JSON.stringify(newCache),
                );
                return { ...prev, data: newCache };
              });
              sessionStorage.removeItem(`content_cache_${id}`);

              setIsMediaModalOpen(false);
              setAlertConfig({
                isOpen: true,
                title: "Success",
                message: "Content updated successfully",
              });
            } catch (error) {
              console.error("Error updating content:", error);
              setAlertConfig({
                isOpen: true,
                title: "Error",
                message: "Failed to update content",
              });
            }
          }}
          initialImdbId={mergedContent.imdbLink?.match(/tt\d+/)?.[0] || ""}
          initialTitle={mergedContent.title}
          initialSecondTitle={mergedContent.secondTitle || ""}
          initialYear={mergedContent.year?.toString() || ""}
        />
      )}

      {/* Share Preview Modal */}
      <SharePreviewModal
        isOpen={sharePreviewModal.isOpen}
        onClose={() => setSharePreviewModal((prev) => ({ ...prev, isOpen: false }))}
        title={sharePreviewModal.title}
        contentTitle={sharePreviewModal.contentTitle}
        posterUrl={sharePreviewModal.posterUrl}
        shareText={sharePreviewModal.text}
        shareSubject={sharePreviewModal.shareSubject}
        themeColor="cyan"
      />

      <ConfirmModal
        isOpen={showRatePrompt}
        title="Enjoying the App?"
        message="It looks like you've been enjoying our app! Would you like to leave a review and let others know what you think?"
        confirmText="Rate Now"
        cancelText="Maybe Later"
        onConfirm={() => {
          setShowRatePrompt(false);
          safeStorage.setItem('has_rated', 'true');
          setHasUserRated(true);
          navigate('/reviews');
        }}
        onCancel={() => {
          setShowRatePrompt(false);
        }}
      />

      <ConfirmModal
        isOpen={showReportConfirm}
        title={t("Report Broken Link")}
        message={t("Are you sure you want to report this link as broken or not working? Our team will check and update it.")}
        confirmText={t("Report Link")}
        cancelText={t("Cancel")}
        loading={isReporting}
        onConfirm={async () => {
          await handleReportLink();
          setShowReportConfirm(false);
        }}
        onCancel={() => {
          setShowReportConfirm(false);
        }}
      />
    </div>
  );
}
