import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import {
  Film,
  MessageCircle,
  Clock,
  X,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Zap,
  Gift,
  Star,
  Share2,
  CheckCircle2,
  Tv,
  Sparkles,
  RefreshCw,
} from "lucide-react";

import { AdBanner } from "../../components/AdBanner";
import { GuestAccessBanner } from "../../components/GuestAccessBanner";
import { Content, Collection as AppCollection } from "../../types";
import { isUserExpired } from "../../contexts/UsersContext";
import { safeStorage } from "../../utils/safeStorage";
import { smartSearch } from "../../utils/searchUtils";
import { memoryStore } from "../../utils/memoryStore";

import { useAuth, standardizePhone } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useContent } from "../../contexts/ContentContext";
import { useCart } from "../../contexts/CartContext";
import { useSettings } from "../../contexts/SettingsContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";

import { Header } from "../../components/Header";
import { PageTransition } from "../../components/PageTransition";
import { ScrollingBanner } from "../../components/ScrollingBanner";
import { ComingSoonSection } from "../../components/ComingSoonSection";
import ContentCard from "../../components/ContentCard";
import ConfirmModal from "../../components/ConfirmModal";

import { HomeFilters } from "../../components/home/HomeFilters";
import { RecentlyViewedSection } from "../../components/home/RecentlyViewedSection";
import { CollectionRow } from "../../components/home/CollectionRow";
import { CuratedCollectionsOverview } from "../../components/home/CuratedCollectionsOverview";
import { HomeCategoryChips } from "../../components/home/HomeCategoryChips";
import { CollectionModal } from "../../components/home/CollectionModal";
import { fetchReviewsFromChunks } from "../../utils/chunkUtils";
import { APP_VERSION } from "../../version";

export default function Home({
  onOpenMediaModal,
}: {
  onOpenMediaModal?: () => void;
}) {
  const { vibrate } = useHaptics();
  const {
    profile,
    logout,
    toggleFavorite,
    toggleWatchLater,
  } = useAuth();
  const {
    contentList,
    genres,
    languages,
    qualities,
    collections,
    loading,
    checkForUpdates,
    quickRefreshCatalog,
  } = useContent();
  const { t, language } = useLanguage();
  const { settings } = useSettings();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const handleToggleFavorite = useCallback(async (id: string) => {
    if (!profile) {
      setShowLoginPrompt(true);
      return;
    }
    await toggleFavorite(id);
  }, [profile, toggleFavorite]);

  const handleToggleWatchLater = useCallback(async (id: string) => {
    if (!profile) {
      setShowLoginPrompt(true);
      return;
    }
    await toggleWatchLater(id);
  }, [profile, toggleWatchLater]);

  // Search parameters sync
  useEffect(() => {
    if (searchParams.has("type")) {
      const typeParam = searchParams.get("type");
      if (typeParam === "movie" || typeParam === "series") {
        setSelectedType(typeParam);
      } else if (typeParam === "all" || typeParam === "") {
        setSelectedType("");
      }
    }
  }, [searchParams]);

  const [search, setSearch] = useState(
    () => sessionStorage.getItem("home_search") || "",
  );
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const catalogSearchInputRef = useRef<HTMLInputElement>(null);

  const [reviewsData, setReviewsData] = useState({ average: "0.0", total: 0 });
  const [hasUserRated, setHasUserRated] = useState<boolean>(() => safeStorage.getItem("has_rated") === "true");

  useEffect(() => {
    const loadReviews = async () => {
      try {
        // Initial load for all users defaults to static reviews
        const data = await fetchReviewsFromChunks();
        if (Array.isArray(data) && data.length > 0) {
          const avg = (data.reduce((acc: number, curr: any) => acc + (curr.rating || 5), 0) / data.length).toFixed(1);
          setReviewsData({ average: avg, total: data.length });
          if (
            profile?.uid &&
            data.some((r: any) => r.userId === profile.uid || (profile.email && r.userEmail === profile.email))
          ) {
            safeStorage.setItem("has_rated", "true");
            setHasUserRated(true);
          }
        }
      } catch (e) {
        console.error("Failed to pre-load reviews on home:", e);
      }
    };
    loadReviews();
  }, [profile?.uid, profile?.email]);

  const [sort, setSort] = useState<"default" | "newest" | "year" | "az">(
    () => (sessionStorage.getItem("home_sort") as any) || "default",
  );
  const [selectedGenre, setSelectedGenre] = useState<string>(
    () => sessionStorage.getItem("home_genre") || "",
  );
  const [selectedLanguage, setSelectedLanguage] = useState<string>(
    () => sessionStorage.getItem("home_language") || "",
  );
  const [selectedType, setSelectedType] = useState<string>(
    () => sessionStorage.getItem("home_type") || "",
  );
  const [selectedQuality, setSelectedQuality] = useState<string>(
    () => sessionStorage.getItem("home_quality") || "",
  );
  const [selectedYear, setSelectedYear] = useState<string>(
    () => sessionStorage.getItem("home_year") || "",
  );
  const [currentPage, setCurrentPage] = useState(
    () => Number(sessionStorage.getItem("home_page")) || 1,
  );
  const firstPageSize = 10;
  const pageSizeAfterFirst = settings?.itemsPerPage || 20;

  const [showFilters, setShowFilters] = useState(() => {
    const hasSearch = !!sessionStorage.getItem("home_search");
    const hasSort = (sessionStorage.getItem("home_sort") || "default") !== "default";
    const hasGenre = !!sessionStorage.getItem("home_genre");
    const hasLang = !!sessionStorage.getItem("home_language");
    const hasType = !!sessionStorage.getItem("home_type");
    const hasQual = !!sessionStorage.getItem("home_quality");
    const hasYear = !!sessionStorage.getItem("home_year");
    return hasSearch || hasSort || hasGenre || hasLang || hasType || hasQual || hasYear;
  });
  const [showCatalogFilters, setShowCatalogFilters] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const [isReferralBannerDismissed, setIsReferralBannerDismissed] = useState(() => {
    return sessionStorage.getItem("referral_banner_dismissed") === "true";
  });
  const [copiedReferralLink, setCopiedReferralLink] = useState(false);

  const isPendingOrExpiredUser = useMemo(() => {
    if (!profile) return true;
    const status = String(profile.status || "");
    if (status === "pending") return true;
    if (status === "expired" && profile.expiryDate && !isUserExpired(profile.expiryDate)) {
      return false;
    }
    if (status === "expired") return true;
    if (profile.expiryDate && profile.expiryDate !== "Lifetime") {
      if (isUserExpired(profile.expiryDate)) return true;
    }
    return false;
  }, [profile]);

  const referralLink = useMemo(() => {
    return `${window.location.origin}/?ref=${profile?.referralCode || ""}`;
  }, [profile?.referralCode]);

  const handleCopyReferralLink = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(referralLink);
      setCopiedReferralLink(true);
      setTimeout(() => setCopiedReferralLink(false), 2500);
    }
  }, [referralLink]);

  const handleShareReferral = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const shareData = {
      title: "MovizNow",
      text: t("Get 10 days of premium membership for free on MovizNow!"),
      url: referralLink,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {}
    } else {
      handleCopyReferralLink(e);
    }
  }, [referralLink, handleCopyReferralLink, t]);

  const [selectedCollection, setSelectedCollection] = useState<AppCollection | null>(() => {
    return memoryStore.get("home_selected_collection") || null;
  });
  const [collectionSort, setCollectionSort] = useState<"default" | "newest" | "az">("default");

  useScrollRestoration("home_window_scroll", true, !loading);
  const collectionScrollRef = useScrollRestoration<HTMLDivElement>(
    "home_selected_collection_scroll",
    false,
    !!selectedCollection,
  );

  useEffect(() => {
    if (selectedCollection) {
      memoryStore.set("home_selected_collection", selectedCollection);
    } else {
      memoryStore.delete("home_selected_collection");
    }
  }, [selectedCollection]);

  // Sync filters and page to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("home_search", search);
    sessionStorage.setItem("home_sort", sort);
    sessionStorage.setItem("home_genre", selectedGenre);
    sessionStorage.setItem("home_language", selectedLanguage);
    sessionStorage.setItem("home_type", selectedType);
    sessionStorage.setItem("home_quality", selectedQuality);
    sessionStorage.setItem("home_year", selectedYear);
    sessionStorage.setItem("home_page", currentPage.toString());
  }, [
    search,
    sort,
    selectedGenre,
    selectedLanguage,
    selectedType,
    selectedQuality,
    selectedYear,
    currentPage,
  ]);

  const trendingCollection = useMemo(
    () =>
      collections.find(
        (c) =>
          c.title.toLowerCase() === "trending" &&
          (c.contentIds?.length || 0) >= 2,
      ),
    [collections],
  );
  const newlyAddedCollection = useMemo(
    () =>
      collections.find(
        (c) =>
          c.title.toLowerCase() === "newly added" &&
          (c.contentIds?.length || 0) >= 2,
      ),
    [collections],
  );
  const otherCollections = useMemo(
    () =>
      collections.filter(
        (c) =>
          c.title.toLowerCase() !== "trending" &&
          c.title.toLowerCase() !== "newly added" &&
          (c.contentIds?.length || 0) >= 2,
      ),
    [collections],
  );

  useModalBehavior(isLogoutModalOpen, () => setIsLogoutModalOpen(false));
  useModalBehavior(!!selectedCollection, () => setSelectedCollection(null));

  const clearFilters = useCallback(() => {
    vibrate(50);
    setSort("default");
    setSelectedType("");
    setSelectedGenre("");
    setSelectedLanguage("");
    setSelectedQuality("");
    setSelectedYear("");
    setSearch("");
    setCurrentPage(1);
    setShowFilters(false);
    setShowCatalogFilters(false);
    setSelectedCollection(null);

    sessionStorage.removeItem("home_sort");
    sessionStorage.removeItem("home_genre");
    sessionStorage.removeItem("home_language");
    sessionStorage.removeItem("home_type");
    sessionStorage.removeItem("home_quality");
    sessionStorage.removeItem("home_year");
    sessionStorage.removeItem("home_page");
    sessionStorage.removeItem("home_search");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [vibrate]);

  const hasActiveFilters =
    sort !== "default" ||
    selectedType !== "" ||
    selectedGenre !== "" ||
    selectedLanguage !== "" ||
    selectedQuality !== "" ||
    selectedYear !== "" ||
    search !== "";

  const hideScrollingTabs = hasActiveFilters || currentPage > 1;

  const [recentlyViewed, setRecentlyViewed] = useState<Content[]>([]);

  useEffect(() => {
    try {
      const recentStr = localStorage.getItem("recently_viewed");
      if (recentStr) {
        setRecentlyViewed(JSON.parse(recentStr));
      }
    } catch (e) {
      console.error("Failed to load recently viewed", e);
    }
  }, []);

  const permittedContentList = useMemo(() => {
    let result = [...contentList];

    // Filter out drafts and selected_content for non-admins and non-editors
    if (
      profile?.role !== "admin" &&
      profile?.role !== "content_manager" &&
      profile?.role !== "manager" &&
      profile?.role !== "owner"
    ) {
      result = result.filter((c) => {
        if (c.status === "draft") return false;
        if (c.status === "selected_content") {
          return profile?.assignedContent?.some(
            (id) => id === c.id || id.startsWith(`${c.id}:`),
          );
        }
        return true;
      });
    }
    return result;
  }, [contentList, profile]);

  // Fast O(1) content lookup map
  const contentMap = useMemo(() => {
    return new Map(permittedContentList.map((c) => [c.id, c]));
  }, [permittedContentList]);

  const enrichedRecentlyViewed = useMemo(() => {
    return recentlyViewed.map((item) => {
      const full = contentMap.get(item.id);
      return full ? { ...item, ...full } : item;
    });
  }, [recentlyViewed, contentMap]);
  const [isRecentVisible, setIsRecentVisible] = useState(() => safeStorage.getItem("home_recent_visible") !== "false");
  const [isTrendingRowVisible, setIsTrendingRowVisible] = useState(() => safeStorage.getItem("home_trending_row_visible") !== "false");
  const [isNewlyAddedVisible, setIsNewlyAddedVisible] = useState(() => safeStorage.getItem("home_newly_added_visible") !== "false");
  const [isCollectionsVisible, setIsCollectionsVisible] = useState(() => safeStorage.getItem("home_collections_visible") !== "false");

  const toggleRecentVisibility = useCallback(() => {
    setIsRecentVisible((prev) => {
      const next = !prev;
      safeStorage.setItem("home_recent_visible", next.toString());
      return next;
    });
  }, []);

  const toggleTrendingRowVisibility = useCallback(() => {
    setIsTrendingRowVisible((prev) => {
      const next = !prev;
      safeStorage.setItem("home_trending_row_visible", next.toString());
      return next;
    });
  }, []);

  const toggleNewlyAddedVisibility = useCallback(() => {
    setIsNewlyAddedVisible((prev) => {
      const next = !prev;
      safeStorage.setItem("home_newly_added_visible", next.toString());
      return next;
    });
  }, []);

  const toggleCollectionsVisibility = useCallback(() => {
    setIsCollectionsVisible((prev) => {
      const next = !prev;
      safeStorage.setItem("home_collections_visible", next.toString());
      return next;
    });
  }, []);

  const uniqueYears = useMemo(() => {
    const years = new Set<number>();
    permittedContentList.forEach((c) => {
      if (c.year && !isNaN(Number(c.year))) years.add(Number(c.year));
      if (c.type === "series" && c.seasons) {
        try {
          const seasons = Array.isArray(c.seasons)
            ? c.seasons
            : JSON.parse(c.seasons || "[]");
          seasons.forEach((s: any) => {
            if (s.year && !isNaN(Number(s.year))) years.add(Number(s.year));
          });
        } catch (e) {}
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [permittedContentList]);

  const assignedContentSet = useMemo(() => {
    const set = new Set<string>();
    profile?.assignedContent?.forEach((id) => {
      set.add(id);
      if (id.includes(":")) {
        set.add(id.split(":")[0]);
      }
    });
    return set;
  }, [profile?.assignedContent]);

  const canPlayBase =
    profile?.role === "admin" ||
    profile?.role === "owner" ||
    profile?.role === "manager" ||
    profile?.role === "content_manager";

  const isProfileActive = profile?.status === "active";
  const isSelectedContentRole = profile?.role === "selected_content";

  const getCanPlay = useCallback(
    (c: any) => {
      if (canPlayBase) return true;
      const isContentAssigned = assignedContentSet.has(c.id);
      if (isContentAssigned) return true;

      if (profile?.role === "user") return false;

      return isProfileActive && !isSelectedContentRole && c.status !== "selected_content";
    },
    [canPlayBase, profile?.role, assignedContentSet, isProfileActive, isSelectedContentRole],
  );

  // Precomputed canPlay map for instant sorting lookups
  const canPlayMap = useMemo(() => {
    const map = new Map<string, boolean>();
    permittedContentList.forEach((c) => {
      map.set(c.id, getCanPlay(c));
    });
    return map;
  }, [permittedContentList, getCanPlay]);

  // Precomputed trending items
  const trendingItems = useMemo(() => {
    if (!trendingCollection?.contentIds) return [];
    const items = trendingCollection.contentIds
      .map((id) => contentMap.get(id))
      .filter((c): c is Content => Boolean(c));

    return items.sort((a, b) => {
      const aCanPlay = canPlayMap.get(a.id) ? 1 : 0;
      const bCanPlay = canPlayMap.get(b.id) ? 1 : 0;
      return bCanPlay - aCanPlay;
    });
  }, [trendingCollection, contentMap, canPlayMap]);

  // Precomputed newly added items
  const newlyAddedItems = useMemo(() => {
    if (!newlyAddedCollection?.contentIds) return [];
    const items = newlyAddedCollection.contentIds
      .map((id) => contentMap.get(id))
      .filter((c): c is Content => Boolean(c));

    return items.sort((a, b) => {
      const aCanPlay = canPlayMap.get(a.id) ? 1 : 0;
      const bCanPlay = canPlayMap.get(b.id) ? 1 : 0;
      return bCanPlay - aCanPlay;
    });
  }, [newlyAddedCollection, contentMap, canPlayMap]);

  // Memoized sorted filter lists
  const sortedGenres = useMemo(() => [...genres].sort((a, b) => a.name.localeCompare(b.name)), [genres]);
  const sortedLanguages = useMemo(() => [...languages].sort((a, b) => a.name.localeCompare(b.name)), [languages]);
  const sortedQualities = useMemo(() => [...qualities].sort((a, b) => a.name.localeCompare(b.name)), [qualities]);

  const filteredAndSortedContent = useMemo(() => {
    let result = [...permittedContentList];

    if (debouncedSearch) {
      result = smartSearch(result, debouncedSearch);
    }
    if (selectedType) {
      result = result.filter((c) => c.type === selectedType);
    }
    if (selectedGenre) {
      result = result.filter((c) => c.genreIds?.includes(selectedGenre));
    }
    if (selectedLanguage) {
      result = result.filter((c) => c.languageIds?.includes(selectedLanguage));
    }
    if (selectedQuality) {
      result = result.filter((c) => c.qualityId === selectedQuality);
    }
    if (selectedYear) {
      result = result.filter((c) => {
        if (c.year?.toString() === selectedYear) return true;
        if (c.type === "series" && c.seasons) {
          try {
            const seasons = Array.isArray(c.seasons)
              ? c.seasons
              : JSON.parse(c.seasons || "[]");
            return seasons.some((s: any) => s.year?.toString() === selectedYear);
          } catch (e) {}
        }
        return false;
      });
    }

    result.sort((a, b) => {
      const aCanPlay = canPlayMap.get(a.id) ? 1 : 0;
      const bCanPlay = canPlayMap.get(b.id) ? 1 : 0;

      if (aCanPlay !== bCanPlay) return bCanPlay - aCanPlay;

      if (debouncedSearch && (sort === "default" || sort === "newest")) {
        return 0;
      }

      if (profile?.role === "selected_content") {
        const aAssigned = assignedContentSet.has(a.id) ? 1 : 0;
        const bAssigned = assignedContentSet.has(b.id) ? 1 : 0;
        if (aAssigned !== bAssigned) return bAssigned - aAssigned;
      }

      if (sort === "default") {
        if (a.order !== undefined && b.order !== undefined) return b.order - a.order;
        if (a.order === undefined && b.order !== undefined) return 1;
        if (a.order !== undefined && b.order === undefined) return -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else if (sort === "newest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else if (sort === "year") {
        return (b.year || 0) - (a.year || 0);
      } else {
        return (a.title || "").localeCompare(b.title || "");
      }
    });

    return result;
  }, [
    permittedContentList,
    debouncedSearch,
    sort,
    selectedType,
    selectedGenre,
    selectedLanguage,
    selectedQuality,
    selectedYear,
    profile?.role,
    canPlayMap,
    assignedContentSet,
  ]);

  const totalPages = useMemo(() => {
    const totalCount = filteredAndSortedContent.length;
    if (totalCount <= firstPageSize) return 1;
    return 1 + Math.ceil((totalCount - firstPageSize) / pageSizeAfterFirst);
  }, [filteredAndSortedContent.length, firstPageSize, pageSizeAfterFirst]);

  const paginatedContent = useMemo(() => {
    if (currentPage === 1) {
      return filteredAndSortedContent.slice(0, firstPageSize);
    } else {
      const start = firstPageSize + (currentPage - 2) * pageSizeAfterFirst;
      return filteredAndSortedContent.slice(start, start + pageSizeAfterFirst);
    }
  }, [
    filteredAndSortedContent,
    currentPage,
    firstPageSize,
    pageSizeAfterFirst,
  ]);

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setCurrentPage(1);
  }, [
    debouncedSearch,
    sort,
    selectedType,
    selectedGenre,
    selectedLanguage,
    selectedQuality,
    selectedYear,
  ]);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const handleSelectCategory = useCallback((type: string) => {
    setSelectedType(type);
    setCurrentPage(1);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      <Helmet>
        <title>{settings?.headerText || "MovizNow"} - {t("Home")}</title>
      </Helmet>
      <Header
        showSearchAndFilters={true}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        hasAnyFilter={hasActiveFilters}
        clearFilters={clearFilters}
        setIsLogoutModalOpen={setIsLogoutModalOpen}
        showBackButton={false}
      />

      {settings?.scrollingText && (
        <ScrollingBanner text={settings.scrollingText} />
      )}

      {/* Main Content */}
      <PageTransition className="flex-1 w-full">
        <main className="relative max-w-7xl mx-auto w-full px-4 pt-4 pb-12 overflow-hidden">
          {/* Ambient Light Effects */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none -z-10" />
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/10 blur-[130px] rounded-full pointer-events-none -z-10" />

          {/* Top Search and Filters Dropdown */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                key="top-filters"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <HomeFilters
                  search={search}
                  setSearch={setSearch}
                  searchInputRef={searchInputRef}
                  sort={sort}
                  setSort={setSort}
                  selectedType={selectedType}
                  setSelectedType={setSelectedType}
                  selectedGenre={selectedGenre}
                  setSelectedGenre={setSelectedGenre}
                  selectedLanguage={selectedLanguage}
                  setSelectedLanguage={setSelectedLanguage}
                  selectedQuality={selectedQuality}
                  setSelectedQuality={setSelectedQuality}
                  selectedYear={selectedYear}
                  setSelectedYear={setSelectedYear}
                  genres={sortedGenres}
                  languages={sortedLanguages}
                  qualities={sortedQualities}
                  uniqueYears={uniqueYears}
                  hasActiveFilters={hasActiveFilters}
                  clearFilters={clearFilters}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Guest Access & Pending Status Banner */}
          <GuestAccessBanner className="mb-6" />

          {/* Referral Banner for Pending & Expired Users */}
          {isPendingOrExpiredUser && !isReferralBannerDismissed && (
            <div className="relative overflow-hidden bg-gradient-to-r from-rose-950 via-purple-950 to-amber-950 border border-rose-500/30 dark:border-rose-500/40 shadow-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 mb-8 text-white transition-all">
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-rose-500/20 blur-3xl rounded-full pointer-events-none" />
              <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-amber-500/20 blur-3xl rounded-full pointer-events-none" />

              <button
                onClick={() => {
                  setIsReferralBannerDismissed(true);
                  sessionStorage.setItem("referral_banner_dismissed", "true");
                }}
                className="absolute top-3 right-3 rtl:right-auto rtl:left-3 p-1.5 text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-zinc-800 rounded-full transition-colors z-10"
                title={t("Dismiss")}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 relative z-0">
                <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                  <div className="p-3 sm:p-4 bg-gradient-to-br from-rose-500 to-amber-500 rounded-2xl shadow-lg shadow-rose-500/20 text-white shrink-0 animate-pulse">
                    <Gift className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div className="space-y-1.5 pr-8 rtl:pr-0 rtl:pl-8 md:pr-0 md:rtl:pl-0" dir={language === "ur" ? "rtl" : "ltr"}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-extrabold uppercase tracking-wider bg-rose-500/20 border border-rose-500/30 text-rose-300">
                        {t("Special Referral Offer")}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span>{t("+10 Days Basic")}</span>
                      </span>
                    </div>
                    <h3 className="font-extrabold text-base sm:text-xl text-white tracking-tight leading-snug">
                      {t("Get 10 Days Free Basic Access!")}
                    </h3>
                    <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed max-w-2xl">
                      {t("Invite friends to MovizNow and unlock 10 days of premium access for both of you!")}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto shrink-0 pt-1 md:pt-0">
                  <Link
                    to="/rewards"
                    className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold rounded-xl text-xs sm:text-sm transition-all shadow-lg shadow-rose-600/25 active:scale-95 text-center"
                  >
                    <Gift className="w-4 h-4" />
                    <span>{t("Invite & Earn 10 Days Free")}</span>
                  </Link>
                  <button
                    onClick={handleShareReferral}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-semibold rounded-xl text-xs sm:text-sm transition-all active:scale-95"
                  >
                    {copiedReferralLink ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">{t("Copied!")}</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-4 h-4 text-rose-400" />
                        <span>{t("Share Offer")}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Re-open trigger pill if dismissed */}
          {isPendingOrExpiredUser && isReferralBannerDismissed && (
            <div className="mb-6 flex justify-end">
              <button
                onClick={() => {
                  setIsReferralBannerDismissed(false);
                  sessionStorage.removeItem("referral_banner_dismissed");
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-rose-500/10 border border-rose-500/20 hover:border-rose-500/40 text-rose-400 dark:text-rose-300 rounded-full text-xs font-semibold transition-all shadow-sm hover:scale-105 active:scale-95"
              >
                <Gift className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>🎁 {t("Get 10 Days Free Basic Access!")}</span>
              </button>
            </div>
          )}

          {/* Status Banner */}
          {profile?.status === "pending" && (
            <div className="bg-yellow-500/10 border border-yellow-500 text-yellow-600 dark:text-yellow-500 p-4 sm:p-6 rounded-2xl mb-8 flex flex-row items-center justify-between gap-4 sm:gap-8">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg sm:text-2xl mb-1 sm:mb-2 text-yellow-600 dark:text-yellow-500">
                  {t("Account Pending")}
                </h3>
                <p className="text-yellow-700 dark:text-yellow-500/80 text-sm sm:text-lg font-medium">
                  {t("Your account activation is pending. Please Get Membership or Add any content to cart to activate your account.")}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:gap-3 min-w-[140px] sm:min-w-[220px] shrink-0">
                {profile?.role === "user" && (
                  <Link
                    to="/top-up"
                    className="flex items-center justify-center gap-1.5 sm:gap-2 bg-yellow-500 text-white dark:text-black px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-yellow-400 transition-all active:scale-95 shadow-lg shadow-yellow-500/20 border border-white/20"
                  >
                    {t("Get Membership")}
                  </Link>
                )}
                <Link
                  to="/cart"
                  className="flex items-center justify-center gap-1.5 sm:gap-2 bg-yellow-500 text-white dark:text-black px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-yellow-400 transition-all active:scale-95 shadow-lg shadow-yellow-500/20 border border-white/20"
                >
                  <ShoppingCart className="w-3 h-3 sm:w-5 sm:h-5" /> {t("Cart")}
                </Link>
                <Link
                  to="/rewards"
                  className="flex items-center justify-center gap-1.5 sm:gap-2 bg-emerald-500 text-white dark:text-black px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-500/20 border border-white/20"
                >
                  <Gift className="w-3 h-3 sm:w-5 sm:h-5" /> {t("Rewards")}
                </Link>
                {((profile?.status && ["pending", "expired"].includes(profile.status)) ||
                  !(hasUserRated || safeStorage.getItem("has_rated") === "true")) && (
                  <Link
                    to="/reviews"
                    className="flex items-center justify-center gap-1.5 sm:gap-2 bg-zinc-800 text-white dark:bg-zinc-200 dark:text-black px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-all active:scale-95 shadow-lg"
                  >
                    <MessageCircle className="w-3 h-3 sm:w-5 sm:h-5" />{" "}
                    {profile?.status && ["pending", "expired"].includes(profile.status)
                      ? t("Check Reviews")
                      : t("Rate our app")}
                  </Link>
                )}
                {settings?.isAdminContactEnabled !== false && (
                  <button
                    onClick={() => {
                      let supportPhone = settings?.supportNumber || "3416286423";
                      if (supportPhone.startsWith("0")) {
                        supportPhone = "92" + supportPhone.substring(1);
                      } else if (!supportPhone.startsWith("92")) {
                        supportPhone = "92" + supportPhone;
                      }
                      const adminPhone = supportPhone.replace("+", "");
                      const msg = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || "N/A"}\n${t("Phone")}: ${profile?.phone || "N/A"}\n${t("Role & Status")}: ${String(
                        profile?.role || "Unknown",
                      )
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase())}, ${String(profile?.status || "Unknown").replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${t("Your message/question:")}\n${t("My account is pending and I need assistance.")}`;
                      window.open(
                        `https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`,
                        "_blank",
                      );
                    }}
                    className="flex items-center justify-center gap-1.5 sm:gap-2 bg-yellow-500/10 border border-yellow-500 text-yellow-600 dark:text-yellow-500 px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-yellow-500/20 transition-all active:scale-95"
                  >
                    <MessageCircle className="w-3 h-3 sm:w-5 sm:h-5" /> {t("Contact Admin")}
                  </button>
                )}
              </div>
            </div>
          )}

          {profile?.status === "expired" && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 sm:p-6 rounded-2xl mb-8 flex flex-row items-center justify-between gap-4 sm:gap-8">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg sm:text-2xl mb-1 sm:mb-2">
                  {profile.role === "trial" ? t("Trial Expired") : t("Membership Expired")}
                </h3>
                <p className="text-red-500/80 text-sm sm:text-lg font-medium">
                  {profile.role === "trial"
                    ? t("Your free Trial has expired. Please get Membership to continue watching.")
                    : t("Your membership has expired. Please renew to continue watching.")}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:gap-3 min-w-[140px] sm:min-w-[220px] shrink-0">
                <Link
                  to="/top-up"
                  className="flex items-center justify-center gap-1.5 sm:gap-2 bg-red-500 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-red-600 transition-all active:scale-95 shadow-lg shadow-red-500/20 border border-white/20"
                >
                  {t("Renew Now")}
                </Link>
                <Link
                  to="/cart"
                  className="flex items-center justify-center gap-1.5 sm:gap-2 bg-red-500 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-red-600 transition-all active:scale-95 shadow-lg shadow-red-500/20 border border-white/20"
                >
                  <ShoppingCart className="w-3 h-3 sm:w-5 sm:h-5" /> {t("Cart")}
                </Link>
                {settings?.isAdminContactEnabled !== false && (
                  <button
                    onClick={() => {
                      let supportPhone = settings?.supportNumber || "3416286423";
                      if (supportPhone.startsWith("0")) {
                        supportPhone = "92" + supportPhone.substring(1);
                      } else if (!supportPhone.startsWith("92")) {
                        supportPhone = "92" + supportPhone;
                      }
                      const adminPhone = supportPhone.replace("+", "");
                      const expiryType = profile?.role === "trial" ? t("Trial") : t("Membership");
                      const msg = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || "N/A"}\n${t("Phone")}: ${profile?.phone || "N/A"}\n${t("Role & Status")}: ${String(
                        profile?.role || t("Unknown"),
                      )
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase())}, ${String(profile?.status || t("Unknown")).replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${t("Your message/question:")}\n${t("My")} ${expiryType} ${t("has expired and I need assistance.")}`;
                      window.open(
                        `https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`,
                        "_blank",
                      );
                    }}
                    className="flex items-center justify-center gap-1.5 sm:gap-2 bg-red-500/10 border border-red-500/30 px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-red-500/20 transition-all active:scale-95"
                  >
                    <MessageCircle className="w-3 h-3 sm:w-5 sm:h-5" /> {t("Contact Admin")}
                  </button>
                )}
                {((profile?.status && ["pending", "expired"].includes(profile.status)) ||
                  !(hasUserRated || safeStorage.getItem("has_rated") === "true")) && (
                  <Link
                    to="/reviews"
                    className="flex items-center justify-center gap-1.5 sm:gap-2 bg-zinc-800 text-white dark:bg-zinc-200 dark:text-black px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-all active:scale-95 shadow-lg"
                  >
                    <MessageCircle className="w-3 h-3 sm:w-5 sm:h-5" />{" "}
                    {profile?.status && ["pending", "expired"].includes(profile.status)
                      ? t("Check Reviews")
                      : t("Rate our app")}
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Recently Viewed Section */}
          {!hideScrollingTabs && (
            <RecentlyViewedSection
              recentlyViewed={enrichedRecentlyViewed}
              isVisible={isRecentVisible}
              onToggleVisibility={toggleRecentVisibility}
              limit={settings?.recentViewLimit || 10}
              profile={profile}
              qualities={qualities}
              languages={languages}
              genres={genres}
              toggleFavorite={handleToggleFavorite}
              toggleWatchLater={handleToggleWatchLater}
            />
          )}

          {/* Trending Section */}
          {!hideScrollingTabs && trendingCollection && (
            <CollectionRow
              title={t("Trending Now")}
              description={trendingCollection.description}
              icon={
                <div className="p-2 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-500 shadow-sm">
                  <TrendingUp className="w-5 h-5" />
                </div>
              }
              scrollKey="scroll_trending"
              items={trendingItems}
              isVisible={isTrendingRowVisible}
              onToggleVisibility={toggleTrendingRowVisibility}
              profile={profile}
              qualities={qualities}
              languages={languages}
              genres={genres}
              toggleFavorite={handleToggleFavorite}
              toggleWatchLater={handleToggleWatchLater}
            />
          )}

          {/* Newly Added Section */}
          {!hideScrollingTabs && newlyAddedCollection && (
            <CollectionRow
              title={t("Newly Added")}
              description={newlyAddedCollection.description}
              icon={
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 shadow-sm">
                  <Zap className="w-5 h-5" />
                </div>
              }
              scrollKey="scroll_newly_added"
              items={newlyAddedItems}
              isVisible={isNewlyAddedVisible}
              onToggleVisibility={toggleNewlyAddedVisibility}
              profile={profile}
              qualities={qualities}
              languages={languages}
              genres={genres}
              toggleFavorite={handleToggleFavorite}
              toggleWatchLater={handleToggleWatchLater}
            />
          )}

          {/* Curated Collections Overview */}
          {!hideScrollingTabs && (
            <CuratedCollectionsOverview
              collections={otherCollections}
              contentMap={contentMap}
              defaultAppImage={settings?.defaultAppImage}
              isVisible={isCollectionsVisible}
              onToggleVisibility={toggleCollectionsVisibility}
              onSelectCollection={setSelectedCollection}
            />
          )}

          {/* Coming Soon Section */}
          {currentPage === 1 && !hideScrollingTabs && (
            <ComingSoonSection className="mb-8" />
          )}

          {/* Ad Banner for Basic Users */}
          <AdBanner className="mb-6" />

          {/* Grid Title */}
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80 mt-10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shadow-sm">
                <Film className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                  {t("Explore Catalog")}
                </h2>
              </div>
            </div>

            {currentPage > 1 && (
              <button
                onClick={() => {
                  vibrate(30);
                  setCurrentPage(1);
                  clearFilters();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs sm:text-sm text-emerald-500 hover:text-emerald-400 font-bold border border-emerald-500/20 bg-emerald-500/10 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{t("Go to Home")}</span>
              </button>
            )}
          </div>

          {/* Quick Category Chips Navigation */}
          <HomeCategoryChips
            selectedType={selectedType}
            setSelectedType={setSelectedType}
            hasActiveFilters={hasActiveFilters}
            showCatalogFilters={showCatalogFilters}
            setShowCatalogFilters={setShowCatalogFilters}
            onClearFilters={clearFilters}
            onSelectCategory={handleSelectCategory}
          />

          {/* Catalog Filter Dropdown */}
          <AnimatePresence>
            {showCatalogFilters && (
              <motion.div
                key="catalog-filters"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <HomeFilters
                  search={search}
                  setSearch={setSearch}
                  searchInputRef={catalogSearchInputRef}
                  sort={sort}
                  setSort={setSort}
                  selectedType={selectedType}
                  setSelectedType={setSelectedType}
                  selectedGenre={selectedGenre}
                  setSelectedGenre={setSelectedGenre}
                  selectedLanguage={selectedLanguage}
                  setSelectedLanguage={setSelectedLanguage}
                  selectedQuality={selectedQuality}
                  setSelectedQuality={setSelectedQuality}
                  selectedYear={selectedYear}
                  setSelectedYear={setSelectedYear}
                  genres={sortedGenres}
                  languages={sortedLanguages}
                  qualities={sortedQualities}
                  uniqueYears={uniqueYears}
                  hasActiveFilters={hasActiveFilters}
                  clearFilters={clearFilters}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Grid */}
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
            </div>
          ) : filteredAndSortedContent.length === 0 ? (
            <div className="text-center py-20 text-zinc-500 flex flex-col items-center">
              <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-xl mb-4">{t("No content found")}</p>
              <button
                onClick={() => {
                  vibrate(50);
                  if ((window as any).triggerRefreshAppData) {
                    (window as any).triggerRefreshAppData('manual');
                  } else {
                    checkForUpdates(true).catch(console.error);
                  }
                }}
                className="px-6 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-bold border border-emerald-500/20 transition-all active:scale-95 flex items-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                {t("Refresh Library")}
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                {paginatedContent.map((content) => (
                  <ContentCard
                    key={content.id}
                    content={content}
                    profile={profile}
                    qualities={qualities}
                    languages={languages}
                    genres={genres}
                    onToggleFavorite={handleToggleFavorite}
                    onToggleWatchLater={handleToggleWatchLater}
                    selectedYear={selectedYear}
                    skipLiveRatingFetch={true}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-12 flex flex-col items-center gap-4">
                  <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        vibrate(50);
                        setCurrentPage((prev) => Math.max(1, prev - 1));
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      disabled={currentPage === 1}
                      className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-medium hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span className="hidden sm:inline">{t("Previous")}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {(() => {
                        const pages = [];
                        const range = 1;

                        for (let i = 1; i <= totalPages; i++) {
                          if (
                            i === 1 ||
                            (i >= currentPage - range && i <= currentPage + range)
                          ) {
                            pages.push(
                              <button
                                key={i}
                                onClick={() => {
                                  vibrate(50);
                                  setCurrentPage(i);
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                                className={clsx(
                                  "w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-sm font-medium transition-colors",
                                  currentPage === i
                                    ? "bg-emerald-500 text-white"
                                    : "bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800",
                                )}
                              >
                                {i}
                              </button>,
                            );
                          } else if (
                            (i === currentPage - range - 1 && i > 1) ||
                            (i === totalPages - 1 && currentPage < totalPages - 2)
                          ) {
                            pages.push(
                              <span
                                key={`dots-${i}`}
                                className="text-zinc-400 dark:text-zinc-600 px-1"
                              >
                                ...
                              </span>,
                            );
                          }
                        }

                        if (currentPage < totalPages) {
                          const lastItem = pages[pages.length - 1];
                          if (
                            lastItem &&
                            (lastItem as any).key &&
                            !(lastItem as any).key.startsWith("dots")
                          ) {
                            pages.push(
                              <span
                                key="final-dots"
                                className="text-zinc-400 dark:text-zinc-600 px-1"
                              >
                                ...
                              </span>,
                            );
                          }
                        }

                        return pages;
                      })()}
                    </div>

                    <button
                      onClick={() => {
                        vibrate(50);
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1));
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      disabled={currentPage === totalPages}
                      className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-medium hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      <span className="hidden sm:inline">{t("Next")}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </PageTransition>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 pt-6 pb-8 flex flex-col items-center gap-4">
        {settings?.isAdminContactEnabled !== false && (
          <div className="text-center text-zinc-500 flex flex-col items-center">
            <p>{t("Need help or want to renew membership?")}</p>
            <button
              onClick={() => {
                const adminPhone = standardizePhone(
                  settings?.supportNumber || "3416286423",
                ).replace("+", "");
                const msg = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || "N/A"}\n${t("Phone")}: ${profile?.phone || "N/A"}\n${t("Role & Status")}: ${String(
                  profile?.role || "Unknown",
                )
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase())}, ${String(profile?.status || "Unknown").replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${t("Your message/question:")}\n${t("I need help or want to renew my membership.")}`;
                window.open(
                  `https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`,
                  "_blank",
                );
              }}
              className="inline-flex items-center gap-2 text-emerald-500 hover:text-emerald-400 mt-2 font-medium cursor-pointer bg-transparent border-none"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp:{" "}
              {standardizePhone(settings?.supportNumber || "3416286423")}
            </button>

            {settings?.whatsappChannelLink && (
              <div className="mt-2">
                <a
                  href={settings.whatsappChannelLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-[#25D366] text-white px-4 py-2 rounded-full font-medium hover:bg-[#20b858] transition-colors shadow-sm"
                >
                  <MessageCircle className="w-4 h-4" /> Join our WhatsApp Channel
                </a>
              </div>
            )}
          </div>
        )}

        <Link
          to="/reviews"
          className="flex flex-col items-center gap-2 hover:scale-105 transition-transform active:scale-95 group"
        >
          <div className="text-3xl font-bold flex items-center gap-2">
            {reviewsData.average}
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={`home-avg-star-${star}`}
                  className={`w-5 h-5 ${
                    star <= Math.round(Number(reviewsData.average))
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-zinc-300 dark:text-zinc-700"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="text-sm font-medium text-zinc-500 group-hover:text-emerald-500 transition-colors">
            {t("Based on %COUNT% reviews").replace("%COUNT%", reviewsData.total.toString())}
          </div>
        </Link>

        <div className="text-center text-xs text-zinc-500 dark:text-zinc-600 font-mono">
          v{APP_VERSION}
        </div>
      </footer>

      <ConfirmModal
        isOpen={isLogoutModalOpen}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        onConfirm={logout}
        onCancel={() => setIsLogoutModalOpen(false)}
      />

      <ConfirmModal
        isOpen={showLoginPrompt}
        title={t("Sign In Required")}
        message={t("Please sign in or create an account to save movies to your favorites and watchlist.")}
        confirmText={t("Sign In / Register")}
        cancelText={t("Cancel")}
        onConfirm={() => {
          setShowLoginPrompt(false);
          navigate("/login", { state: { from: location } });
        }}
        onCancel={() => setShowLoginPrompt(false)}
      />

      {/* Collection Modal */}
      <CollectionModal
        collection={selectedCollection}
        onClose={() => {
          setSelectedCollection(null);
          setCollectionSort("default");
        }}
        collectionSort={collectionSort}
        setCollectionSort={setCollectionSort}
        scrollRef={collectionScrollRef}
        contentMap={contentMap}
        canPlayMap={canPlayMap}
        profile={profile}
        qualities={qualities}
        languages={languages}
        genres={genres}
        toggleFavorite={handleToggleFavorite}
        toggleWatchLater={handleToggleWatchLater}
      />
    </div>
  );
}
