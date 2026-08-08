import { fetchReviewsFromChunks } from "../../utils/chunkUtils";
import { safeStorage } from "../../utils/safeStorage";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";

import { Content, Role, Collection as AppCollection } from "../../types";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useContent } from "../../contexts/ContentContext";
import { useCart } from "../../contexts/CartContext";
import { usePWA } from "../../contexts/PWAContext";
import { standardizePhone } from "../../contexts/AuthContext";
import {
  Film,
  Phone,
  Search,
  Filter,
  MessageCircle,
  Clock,
  Heart,
  LogOut,
  User,
  Users,
  Lock,
  LayoutDashboard,
  X,
  ShoppingCart,
  Plus,
  ChevronLeft,
  ChevronRight,
  Download,
  TrendingUp,
  Zap,
  AlertCircle,
  Gift,
  Star,
  Share2,
  CheckCircle2,
  Play,
  Info,
  Flame,
  Tv,
  SlidersHorizontal,
  Compass,
  Sparkles,
  RefreshCw
} from "lucide-react";
import { Helmet } from "react-helmet";
import { clsx } from "clsx";
import { format } from "date-fns";
import ConfirmModal from "../../components/ConfirmModal";
import { formatContentTitle, getContrastColor } from "../../utils/contentUtils";
import { getOptimizedImageUrl, getImageSrcSet } from "../../utils/imageUtils";
import { smartSearch } from "../../utils/searchUtils";

import ContentCard from "../../components/ContentCard";
import { ScrollableRow } from "../../components/ScrollableRow";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";
import { memoryStore } from "../../utils/memoryStore";

import { NotificationMenu } from "../../components/NotificationMenu";
import { UserProfileMenu } from "../../components/UserProfileMenu";
import { AdminButtons } from "../../components/AdminButtons";
import { CartButton } from "../../components/CartButton";

import { ThemeToggle } from "../../components/ThemeToggle";
import { useSettings } from "../../contexts/SettingsContext";
import { useHaptics } from "../../hooks/useHaptics";

import { Header } from "../../components/Header";
import { PageTransition } from "../../components/PageTransition";
import { ScrollingBanner } from "../../components/ScrollingBanner";

export default function Home({
  onOpenMediaModal,
}: {
  onOpenMediaModal: () => void;
}) {
  const { vibrate } = useHaptics();
  const {
    profile,
    logout,
    toggleFavorite,
    toggleWatchLater,
    updateUserProfileData,
    refreshProfile,
  } = useAuth();
  const {
    contentList,
    genres,
    languages,
    qualities,
    collections,
    loading,
    isOffline,
    checkForUpdates,
  } = useContent();
  const { t, language } = useLanguage();
  const { cart } = useCart();
  const { settings } = useSettings();
  const { isInstallable, installApp } = usePWA();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const [reviewsData, setReviewsData] = useState({ average: "0.0", total: 0 });
  const [hasUserRated, setHasUserRated] = useState<boolean>(() => safeStorage.getItem('has_rated') === 'true');

  useEffect(() => {
    if (safeStorage.getItem('has_rated') === 'true') {
      setHasUserRated(true);
    }
    const loadReviews = async () => {
      try {
        const cachedData = safeStorage.getItem('cached_reviews_data');
        let data: any[] | null = null;
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            if (Array.isArray(parsed)) {
               data = parsed;
            }
          } catch(e) {}
        }
        if (data === null) {
            data = await fetchReviewsFromChunks(false);
        }
        if (data && data.length > 0) {
           const avg = (data.reduce((acc, curr) => acc + curr.rating, 0) / data.length).toFixed(1);
           setReviewsData({ average: avg, total: data.length });
           if (profile?.uid && data.some((r: any) => r.userId === profile.uid || (profile.email && r.userEmail === profile.email))) {
             safeStorage.setItem('has_rated', 'true');
             setHasUserRated(true);
           }
        }
      } catch(e) {}
    };
    loadReviews();
  }, [profile?.uid, profile?.email]);

  const autoRefreshAttempted = useRef(false);
  useEffect(() => {
    if (!loading && contentList.length === 0 && !autoRefreshAttempted.current) {
      autoRefreshAttempted.current = true;
      checkForUpdates(true).catch(console.error);
    }
  }, [loading, contentList.length, checkForUpdates]);

  // ... (rest of the component)

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
    const hasSort =
      (sessionStorage.getItem("home_sort") || "default") !== "default";
    const hasGenre = !!sessionStorage.getItem("home_genre");
    const hasLang = !!sessionStorage.getItem("home_language");
    const hasType = !!sessionStorage.getItem("home_type");
    const hasQual = !!sessionStorage.getItem("home_quality");
    const hasYear = !!sessionStorage.getItem("home_year");
    return (
      hasSearch ||
      hasSort ||
      hasGenre ||
      hasLang ||
      hasType ||
      hasQual ||
      hasYear
    );
  });
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const [isReferralBannerDismissed, setIsReferralBannerDismissed] = useState(() => {
    return sessionStorage.getItem('referral_banner_dismissed') === 'true';
  });
  const [copiedReferralLink, setCopiedReferralLink] = useState(false);

  const isPendingOrExpiredUser = useMemo(() => {
    if (!profile) return true;
    const status = String(profile.status || '');
    if (status === 'pending' || status === 'expired') return true;
    if (profile.expiryDate && new Date(profile.expiryDate) < new Date() && status !== 'active') return true;
    return false;
  }, [profile]);

  const referralLink = useMemo(() => {
    return `${window.location.origin}/?ref=${profile?.referralCode || ''}`;
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
      title: 'MovizNow',
      text: t('Get 5 days of premium membership for free on MovizNow!'),
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

  const [selectedCollection, setSelectedCollection] =
    useState<AppCollection | null>(() => {
      return memoryStore.get("home_selected_collection") || null;
    });
  const [collectionSort, setCollectionSort] = useState<
    "default" | "newest" | "az"
  >("default");

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

  const clearFilters = () => {
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
    setSelectedCollection(null);

    // Also clear session storage explicitly to be safe
    sessionStorage.removeItem("home_sort");
    sessionStorage.removeItem("home_genre");
    sessionStorage.removeItem("home_language");
    sessionStorage.removeItem("home_type");
    sessionStorage.removeItem("home_quality");
    sessionStorage.removeItem("home_year");
    sessionStorage.removeItem("home_page");
    sessionStorage.removeItem("home_search");

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const hasActiveFilters =
    sort !== "default" ||
    selectedType !== "" ||
    selectedGenre !== "" ||
    selectedLanguage !== "" ||
    selectedQuality !== "" ||
    selectedYear !== "" ||
    search !== "";

  const hasAnyFilter = hasActiveFilters;

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

  // Featured Hero Carousel Spotlight items
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);
  const [isHeroHovered, setIsHeroHovered] = useState(false);

  const heroContentItems = useMemo(() => {
    if (permittedContentList.length === 0) return [];
    const featured = permittedContentList.filter((c: any) => c.isFeatured || c.featured);
    if (featured.length >= 2) return featured.slice(0, 6);
    if (trendingCollection && trendingCollection.contentIds.length > 0) {
      const trendingItems = trendingCollection.contentIds
        .map(id => permittedContentList.find(c => c.id === id))
        .filter((c): c is Content => !!c);
      if (trendingItems.length >= 2) return trendingItems.slice(0, 6);
    }
    return permittedContentList
      .filter(c => !!c.posterUrl)
      .slice(0, 6);
  }, [permittedContentList, trendingCollection]);

  useEffect(() => {
    if (heroContentItems.length <= 1 || isHeroHovered) return;
    const timer = setInterval(() => {
      setCurrentHeroIndex((prev) => (prev + 1) % heroContentItems.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [heroContentItems.length, isHeroHovered]);

  // Preload hero banner images to eliminate image decode lag on poster transitions
  useEffect(() => {
    if (!heroContentItems.length) return;
    heroContentItems.forEach((item) => {
      const url = item.posterUrl || settings?.defaultAppImage;
      if (url) {
        const img = new Image();
        img.src = getOptimizedImageUrl(url, 1280);
      }
    });
  }, [heroContentItems, settings?.defaultAppImage]);

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

  const recentlyAddedContent = useMemo(() => {
    let result = [...permittedContentList];
    return result
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 10);
  }, [permittedContentList]);

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30";
      case "manager":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
      case "content_manager":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30";
      case "selected_content":
        return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
      default:
        return "bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-500/30";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
      case "expired":
        return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
      case "suspended":
        return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
      case "pending":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
      default:
        return "bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-500/30";
    }
  };

  const assignedContentSet = useMemo(() => {
    const set = new Set<string>();
    profile?.assignedContent?.forEach(id => {
      set.add(id);
      if (id.includes(':')) {
        set.add(id.split(':')[0]);
      }
    });
    return set;
  }, [profile?.assignedContent]);

  const canPlayBase = 
    profile?.role === 'admin' ||
    profile?.role === 'owner' ||
    profile?.role === 'manager' ||
    profile?.role === 'content_manager';

  const isProfileActive = profile?.status === 'active';
  const isSelectedContentRole = profile?.role === "selected_content";

  const getCanPlay = useCallback((c: any) => {
    if (canPlayBase) return true;
    const isContentAssigned = assignedContentSet.has(c.id);
    if (isContentAssigned) return true;
    
    return isProfileActive && !isSelectedContentRole && c.status !== "selected_content";
  }, [canPlayBase, assignedContentSet, isProfileActive, isSelectedContentRole]);

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
            return seasons.some(
              (s: any) => s.year?.toString() === selectedYear,
            );
          } catch (e) {}
        }
        return false;
      });
    }

    // If searching and default or newest sort, allow smartSearch to dictate order but still prioritize accessible content
    result.sort((a, b) => {
      // Always show accessible content before restricted content
      const aCanPlay = getCanPlay(a) ? 1 : 0;
      const bCanPlay = getCanPlay(b) ? 1 : 0;
      
      if (aCanPlay !== bCanPlay) return bCanPlay - aCanPlay;
      
      if (debouncedSearch && (sort === "default" || sort === "newest")) {
        return 0; // maintain search score order
      }

      // For selected_content users, prioritize assigned content within their allowed pool (if any)
      if (profile?.role === "selected_content") {
        const aAssigned = assignedContentSet.has(a.id) ? 1 : 0;
        const bAssigned = assignedContentSet.has(b.id) ? 1 : 0;
        if (aAssigned !== bAssigned) return bAssigned - aAssigned;
      }

      if (sort === "default") {
        if (a.order !== undefined && b.order !== undefined)
          return b.order - a.order;
        if (a.order === undefined && b.order !== undefined) return 1;
        if (a.order !== undefined && b.order === undefined) return -1;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      } else if (sort === "newest") {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
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
    profile,
  ]);

  const totalPages = useMemo(() => {
    const totalCount = filteredAndSortedContent.length;
    if (totalCount <= firstPageSize) return 1;
    return 1 + Math.ceil((totalCount - firstPageSize) / pageSizeAfterFirst);
  }, [filteredAndSortedContent, firstPageSize, pageSizeAfterFirst]);

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
  // Reset to page 1 when filters change
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

  // Ensure current page is within bounds
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      <Helmet>
        <title>{settings?.headerText || "MovizNow"} - {t("Home")}</title>
      </Helmet>
      <Header 
        showSearchAndFilters={true}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        hasAnyFilter={hasAnyFilter}
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

        {/* Featured Hero Carousel Spotlight Banner */}
        {!hideScrollingTabs && heroContentItems.length > 0 && (
          <div 
            className="relative w-full mb-8 rounded-3xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-950 shadow-2xl group transition-all transform-gpu"
            style={{ isolation: "isolate" }}
            onMouseEnter={() => setIsHeroHovered(true)}
            onMouseLeave={() => setIsHeroHovered(false)}
          >
            <AnimatePresence mode="wait">
              {heroContentItems.map((item, idx) => {
                if (idx !== currentHeroIndex) return null;
                const isFav = profile?.favorites?.includes(item.id);
                const isWL = profile?.watchLater?.includes(item.id);
                const canPlay = getCanPlay(item);
                const qualityName = qualities.find(q => q.id === item.qualityId)?.name || 'HD';
                const langNames = languages
                  .filter(l => item.languageIds?.includes(l.id))
                  .map(l => l.name)
                  .slice(0, 2)
                  .join(" • ");
                const genreNames = genres
                  .filter(g => item.genreIds?.includes(g.id))
                  .map(g => g.name)
                  .slice(0, 3)
                  .join(" / ");

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="relative min-h-[420px] sm:min-h-[480px] md:min-h-[540px] flex items-end p-5 sm:p-8 md:p-12 overflow-hidden transform-gpu"
                  >
                    {/* Background Image & Vignettes */}
                    <div className="absolute inset-0 z-0">
                      <img
                        src={getOptimizedImageUrl(item.posterUrl || settings?.defaultAppImage, 1280)}
                        srcSet={getImageSrcSet(item.posterUrl || settings?.defaultAppImage)}
                        sizes="(max-width: 768px) 780px, 1280px"
                        alt={item.title}
                        loading="eager"
                        decoding="async"
                        className="w-full h-full object-cover object-center filter brightness-95 contrast-105 transform-gpu transition-transform duration-300 scale-105 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 via-70% to-transparent z-10" />
                      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/90 via-zinc-950/40 via-45% to-transparent z-10 rtl:bg-gradient-to-l" />
                      <div className="absolute top-0 right-0 left-0 h-20 bg-gradient-to-b from-zinc-950/50 to-transparent z-10" />
                    </div>

                    {/* Content Details & Poster Side-by-Side */}
                    <div className="relative z-20 w-full flex flex-col md:flex-row items-end justify-between gap-6 pb-12 sm:pb-2">
                      <div className="max-w-2xl space-y-3 sm:space-y-4 w-full">
                        <div className="flex items-center gap-2 flex-wrap pr-16 sm:pr-0">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider bg-gradient-to-r from-rose-500 via-purple-500 to-amber-500 text-white shadow-lg shadow-purple-500/20">
                            <Flame className="w-3.5 h-3.5 fill-current animate-bounce" />
                            <span>{t("Trending Spotlight")}</span>
                          </span>
                          
                          <span className="px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md">
                            {item.type === 'series' ? t('Series') : t('Movie')}
                          </span>

                          {item.year && (
                            <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 backdrop-blur-md">
                              {item.year}
                            </span>
                          )}

                          {qualityName && (
                            <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 backdrop-blur-md">
                              {qualityName}
                            </span>
                          )}
                        </div>

                        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight drop-shadow-2xl">
                          {formatContentTitle(item)}
                        </h1>

                        {(genreNames || langNames) && (
                          <p className="text-xs sm:text-sm text-zinc-300 font-medium flex items-center gap-2 flex-wrap">
                            {genreNames && <span>{genreNames}</span>}
                            {genreNames && langNames && <span className="text-emerald-500">•</span>}
                            {langNames && <span className="text-emerald-400 font-bold">{langNames}</span>}
                          </p>
                        )}

                        <p className="text-xs sm:text-sm text-zinc-300/90 leading-relaxed line-clamp-2 sm:line-clamp-3 max-w-xl font-normal drop-shadow">
                          {item.description}
                        </p>

                        <div className="pt-2 flex items-center gap-3 flex-wrap max-w-full sm:max-w-md">
                          <Link
                            to={item.type === 'series' ? `/series/${item.id}` : `/movie/${item.id}`}
                            onClick={() => vibrate(50)}
                            className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-xs sm:text-sm flex items-center gap-2 shadow-xl shadow-emerald-500/30 active:scale-95 transition-all transform hover:scale-105"
                          >
                            <Play className="w-4 h-4 fill-current" />
                            <span>{canPlay ? t('Watch Now') : t('View Details')}</span>
                          </Link>

                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              vibrate(50);
                              toggleFavorite(item.id);
                            }}
                            className={clsx(
                              "p-3 rounded-xl border backdrop-blur-md transition-all active:scale-95 flex items-center justify-center",
                              isFav 
                                ? "bg-rose-500/20 border-rose-500/50 text-rose-400" 
                                : "bg-zinc-800/80 hover:bg-zinc-700/80 border-zinc-700/60 text-zinc-200"
                            )}
                            title={t('Favorites')}
                          >
                            <Heart className={clsx("w-5 h-5", isFav && "fill-current")} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              vibrate(50);
                              toggleWatchLater(item.id);
                            }}
                            className={clsx(
                              "p-3 rounded-xl border backdrop-blur-md transition-all active:scale-95 flex items-center justify-center",
                              isWL 
                                ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-400" 
                                : "bg-zinc-800/80 hover:bg-zinc-700/80 border-zinc-700/60 text-zinc-200"
                            )}
                            title={t('Watch Later')}
                          >
                            <Clock className={clsx("w-5 h-5", isWL && "fill-current")} />
                          </button>
                        </div>
                      </div>

                      {/* Mini Poster Card Badge */}
                      <div className="hidden sm:block shrink-0 relative group/thumb">
                        <div className="w-28 h-40 sm:w-36 sm:h-52 md:w-44 md:h-64 rounded-2xl overflow-hidden border-2 border-emerald-500/40 shadow-2xl bg-zinc-900 transition-transform duration-300 group-hover/thumb:scale-105">
                          <img 
                            src={getOptimizedImageUrl(item.posterUrl || settings?.defaultAppImage, 342)} 
                            alt={item.title} 
                            loading="eager"
                            decoding="async"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {heroContentItems.length > 1 && (
              <div className="absolute bottom-4 right-4 rtl:right-auto rtl:left-4 z-30 flex items-center gap-2 bg-zinc-950/80 backdrop-blur-md p-1.5 rounded-full border border-zinc-700/70 shadow-2xl">
                <button
                  onClick={() => {
                    vibrate(30);
                    setCurrentHeroIndex((prev) => (prev - 1 + heroContentItems.length) % heroContentItems.length);
                  }}
                  className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-300 hover:text-white transition-colors"
                  title="Previous slide"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1.5 px-1">
                  {heroContentItems.map((_, dotIdx) => (
                    <button
                      key={`dot-${dotIdx}`}
                      onClick={() => {
                        vibrate(30);
                        setCurrentHeroIndex(dotIdx);
                      }}
                      className={clsx(
                        "h-2 rounded-full transition-all duration-300",
                        dotIdx === currentHeroIndex 
                          ? "w-6 bg-emerald-500 shadow-sm shadow-emerald-500/50" 
                          : "w-2 bg-zinc-600 hover:bg-zinc-400"
                      )}
                    />
                  ))}
                </div>

                <button
                  onClick={() => {
                    vibrate(30);
                    setCurrentHeroIndex((prev) => (prev + 1) % heroContentItems.length);
                  }}
                  className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-300 hover:text-white transition-colors"
                  title="Next slide"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

                {/* Referral Banner for Pending & Expired Users */}
        {isPendingOrExpiredUser && !isReferralBannerDismissed && (
          <div className="relative overflow-hidden bg-gradient-to-r from-rose-950 via-purple-950 to-amber-950 border border-rose-500/30 dark:border-rose-500/40 shadow-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 mb-8 text-white transition-all">
            {/* Ambient Background Glows */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-rose-500/20 blur-3xl rounded-full pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-amber-500/20 blur-3xl rounded-full pointer-events-none" />

            {/* Dismiss / Close button */}
            <button
              onClick={() => {
                setIsReferralBannerDismissed(true);
                sessionStorage.setItem('referral_banner_dismissed', 'true');
              }}
              className="absolute top-3 right-3 rtl:right-auto rtl:left-3 p-1.5 text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-zinc-800 rounded-full transition-colors z-10"
              title={t('Dismiss')}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 relative z-0">
              <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                <div className="p-3 sm:p-4 bg-gradient-to-br from-rose-500 to-amber-500 rounded-2xl shadow-lg shadow-rose-500/20 text-white shrink-0 animate-pulse">
                  <Gift className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
                <div className="space-y-1.5 pr-8 rtl:pr-0 rtl:pl-8 md:pr-0 md:rtl:pl-0" dir={language === 'ur' ? 'rtl' : 'ltr'}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-extrabold uppercase tracking-wider bg-rose-500/20 border border-rose-500/30 text-rose-300">
                      {t('Special Referral Offer')}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                      <span>{t('+5 Days VIP')}</span>
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base sm:text-xl text-white tracking-tight leading-snug">
                    {t('Get 5 Days Free VIP Access!')}
                  </h3>
                  <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed max-w-2xl">
                    {t('Invite friends to MovizNow and unlock 5 days of premium access for both of you!')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto shrink-0 pt-1 md:pt-0">
                <Link
                  to="/rewards"
                  className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold rounded-xl text-xs sm:text-sm transition-all shadow-lg shadow-rose-600/25 active:scale-95 text-center"
                >
                  <Gift className="w-4 h-4" />
                  <span>{t('Invite & Earn 5 Days Free')}</span>
                </Link>
                <button
                  onClick={handleShareReferral}
                  className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-semibold rounded-xl text-xs sm:text-sm transition-all active:scale-95"
                >
                  {copiedReferralLink ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">{t('Copied!')}</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4 text-rose-400" />
                      <span>{t('Share Offer')}</span>
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
                sessionStorage.removeItem('referral_banner_dismissed');
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-rose-500/10 border border-rose-500/20 hover:border-rose-500/40 text-rose-400 dark:text-rose-300 rounded-full text-xs font-semibold transition-all shadow-sm hover:scale-105 active:scale-95"
            >
              <Gift className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>🎁 {t('Get 5 Days Free VIP Access!')}</span>
            </button>
          </div>
        )}

        {/* Status Banner */}
        {profile?.status === "pending" && (
          <div className="bg-yellow-500/10 border border-yellow-500 text-yellow-600 dark:text-yellow-500 p-4 sm:p-6 rounded-2xl mb-8 flex flex-row items-center justify-between gap-4 sm:gap-8">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg sm:text-2xl mb-1 sm:mb-2 text-yellow-600 dark:text-yellow-500">
                {t('Account Pending')}
              </h3>
              <p className="text-yellow-700 dark:text-yellow-500/80 text-sm sm:text-lg font-medium">
                {t('Your account activation is pending. Please Get Membership or Add any content to cart to activate your account.')}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:gap-3 min-w-[140px] sm:min-w-[220px] shrink-0">
              {profile?.role === "user" && (
                <Link
                  to="/top-up"
                  className="flex items-center justify-center gap-1.5 sm:gap-2 bg-yellow-500 text-white dark:text-black px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-yellow-400 transition-all active:scale-95 shadow-lg shadow-yellow-500/20 border border-white/20"
                >
                  {t('Get Membership')}
                </Link>
              )}
              <Link
                to="/cart"
                className="flex items-center justify-center gap-1.5 sm:gap-2 bg-yellow-500 text-white dark:text-black px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-yellow-400 transition-all active:scale-95 shadow-lg shadow-yellow-500/20 border border-white/20"
              >
                <ShoppingCart className="w-3 h-3 sm:w-5 sm:h-5" /> {t('Cart')}
              </Link>
              <Link
                to="/rewards"
                className="flex items-center justify-center gap-1.5 sm:gap-2 bg-emerald-500 text-white dark:text-black px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-500/20 border border-white/20"
              >
                <Gift className="w-3 h-3 sm:w-5 sm:h-5" /> {t('Rewards')}
              </Link>
              {((profile?.status && (['pending', 'expired'] as string[]).includes(profile.status)) || !(hasUserRated || safeStorage.getItem('has_rated') === 'true')) && (
                <Link
                  to="/reviews"
                  className="flex items-center justify-center gap-1.5 sm:gap-2 bg-zinc-800 text-white dark:bg-zinc-200 dark:text-black px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-all active:scale-95 shadow-lg"
                >
                  <MessageCircle className="w-3 h-3 sm:w-5 sm:h-5" /> {profile?.status && (['pending', 'expired'] as string[]).includes(profile.status) ? t('Check Reviews') : t('Rate our app')}
                </Link>
              )}
              {settings?.isAdminContactEnabled !== false && (
                <button
                  onClick={() => {
                    let supportPhone = settings?.supportNumber || "3363284466";
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
                      .replace(/\b\w/g, (c) =>
                        c.toUpperCase(),
                      )}, ${String(profile?.status || "Unknown").replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${t("Your message/question:")}\n${t("My account is pending and I need assistance.")}`;
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
                {profile.role === "trial"
                  ? t("Trial Expired")
                  : t("Membership Expired")}
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
                <ShoppingCart className="w-3 h-3 sm:w-5 sm:h-5" /> {t('Cart')}
              </Link>
              {settings?.isAdminContactEnabled !== false && (
                <button
                  onClick={() => {
                    let supportPhone = settings?.supportNumber || "3363284466";
                    if (supportPhone.startsWith("0")) {
                      supportPhone = "92" + supportPhone.substring(1);
                    } else if (!supportPhone.startsWith("92")) {
                      supportPhone = "92" + supportPhone;
                    }
                    const adminPhone = supportPhone.replace("+", "");
                    const expiryType =
                      profile?.role === "trial" ? t("Trial") : t("Membership");
                    const msg = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || "N/A"}\n${t("Phone")}: ${profile?.phone || "N/A"}\n${t("Role & Status")}: ${String(
                      profile?.role || t("Unknown"),
                    )
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c) =>
                        c.toUpperCase(),
                      )}, ${String(profile?.status || t("Unknown")).replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${t("Your message/question:")}\n${t("My")} ${expiryType} ${t("has expired and I need assistance.")}`;
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
              {((profile?.status && (['pending', 'expired'] as string[]).includes(profile.status)) || !(hasUserRated || safeStorage.getItem('has_rated') === 'true')) && (
                <Link
                  to="/reviews"
                  className="flex items-center justify-center gap-1.5 sm:gap-2 bg-zinc-800 text-white dark:bg-zinc-200 dark:text-black px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-all active:scale-95 shadow-lg"
                >
                  <MessageCircle className="w-3 h-3 sm:w-5 sm:h-5" /> {profile?.status && (['pending', 'expired'] as string[]).includes(profile.status) ? t('Check Reviews') : t('Rate our app')}
                </Link>
              )}
            </div>
          </div>
        )}
        {/* Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              key="filters"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-4 mb-6">
                <div className="relative w-full">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={t("Search movies & series...")}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                    }}
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-12 py-3 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 transition-colors duration-300"
                  />
                  {search && (
                    <button
                      onClick={() => {
                        vibrate(50);
                        setSearch("");
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20 hover:bg-red-500/20 transition-colors"
                      title="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <ScrollableRow
                  scrollKey="scroll_filters_container"
                  className="flex gap-3 overflow-x-auto pb-2 md:pb-0 flex-nowrap relative"
                >
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="sticky left-0 z-10 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg px-2 py-1 text-xs flex items-center gap-1 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.5)]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as any)}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-colors"
                  >
                    <option value="default">{t('Default Order')}</option>
                    <option value="newest">{t('Recently Added')}</option>
                    <option value="year">{t('Release Year')}</option>
                    <option value="az">{t('A-Z')}</option>
                  </select>

                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-colors"
                  >
                    <option value="">{t('Types')}</option>
                    <option value="movie">{t('Movies')}</option>
                    <option value="series">{t('Series')}</option>
                  </select>

                  <select
                    value={selectedGenre}
                    onChange={(e) => setSelectedGenre(e.target.value)}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-colors"
                  >
                    <option value="">{t('Genres')}</option>
                    {[...genres]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </select>

                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-colors"
                  >
                    <option value="">{t('Langs')}</option>
                    {[...languages]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>

                  <select
                    value={selectedQuality}
                    onChange={(e) => setSelectedQuality(e.target.value)}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-colors"
                  >
                    <option value="">{t('Quals')}</option>
                    {[...qualities]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.name}
                        </option>
                      ))}
                  </select>

                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-colors"
                  >
                    <option value="">{t('Years')}</option>
                    {uniqueYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </ScrollableRow>
              </div>
            </motion.div>
          )}
        </AnimatePresence>{" "}
        {/* Recently Viewed Section */}
        {!hideScrollingTabs && recentlyViewed.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 shadow-sm">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                    {t('Recently Viewed')}
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    {t('Continue where you left off')}
                  </p>
                </div>
              </div>
            </div>
            <div className="relative group">
              <ScrollableRow
                scrollKey="scroll_recently_viewed"
                className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory flex-nowrap hide-scrollbar"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {recentlyViewed
                  .slice(0, settings?.recentViewLimit || 10)
                  .map((content) => (
                    <div
                      key={content.id}
                      className="w-[110px] sm:w-[140px] shrink-0 snap-start"
                    >
                      <ContentCard
                        content={content}
                        profile={profile}
                        qualities={qualities}
                        languages={languages}
                        genres={genres}
                        onToggleFavorite={toggleFavorite}
                        onToggleWatchLater={toggleWatchLater}
                        isSmall={true}
                      />
                    </div>
                  ))}
              </ScrollableRow>
            </div>
          </div>
        )}
        {/* Trending Section */}
        {!hideScrollingTabs && trendingCollection && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-500 shadow-sm">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                    {t('Trending Now')}
                  </h2>
                  {trendingCollection.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                      {trendingCollection.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="relative group">
              <ScrollableRow
                scrollKey="scroll_trending"
                className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory flex-nowrap hide-scrollbar"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {trendingCollection.contentIds
                  .map((id) => permittedContentList.find((c) => c.id === id))
                  .filter(Boolean)
                  .sort((a, b) => {
                    const aCanPlay = getCanPlay(a) ? 1 : 0;
                    const bCanPlay = getCanPlay(b) ? 1 : 0;
                    return bCanPlay - aCanPlay;
                  })
                  .map((content) => {
                    if (!content) return null;
                    return (
                      <div
                        key={content.id}
                        className="w-[140px] sm:w-[180px] shrink-0 snap-start"
                      >
                      <ContentCard
                        content={content}
                        profile={profile}
                        qualities={qualities}
                        languages={languages}
                        genres={genres}
                        onToggleFavorite={toggleFavorite}
                        onToggleWatchLater={toggleWatchLater}
                      />
                    </div>
                  );
                })}
              </ScrollableRow>
            </div>
          </div>
        )}
        {/* Newly Added Section */}
        {!hideScrollingTabs && newlyAddedCollection && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 shadow-sm">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                    {t('Newly Added')}
                  </h2>
                  {newlyAddedCollection.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                      {newlyAddedCollection.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="relative group">
              <ScrollableRow
                scrollKey="scroll_newly_added"
                className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory flex-nowrap hide-scrollbar"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {newlyAddedCollection.contentIds
                  .map((id) => permittedContentList.find((c) => c.id === id))
                  .filter(Boolean)
                  .sort((a, b) => {
                    const aCanPlay = getCanPlay(a) ? 1 : 0;
                    const bCanPlay = getCanPlay(b) ? 1 : 0;
                    return bCanPlay - aCanPlay;
                  })
                  .map((content) => {
                    if (!content) return null;
                    return (
                      <div
                        key={content.id}
                        className="w-[140px] sm:w-[180px] shrink-0 snap-start"
                      >
                      <ContentCard
                        content={content}
                        profile={profile}
                        qualities={qualities}
                        languages={languages}
                        genres={genres}
                        onToggleFavorite={toggleFavorite}
                        onToggleWatchLater={toggleWatchLater}
                      />
                    </div>
                  );
                })}
              </ScrollableRow>
            </div>
          </div>
        )}
        {/* Collections Overview */}
        {!hideScrollingTabs && otherCollections.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-500 shadow-sm">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                  {t('Curated Collections')}
                </h2>
              </div>
            </div>
            <div className="relative group">
              <ScrollableRow
                scrollKey="scroll_collections_overview"
                className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory flex-nowrap hide-scrollbar"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {otherCollections.map((collection) => {
                  const firstContentId = collection.contentIds[0];
                  const firstContent = permittedContentList.find(
                    (c) => c.id === firstContentId,
                  );
                  const posterUrl =
                    firstContent?.posterUrl || settings?.defaultAppImage;

                  return (
                    <button
                      key={collection.id}
                      onClick={() => {
                        vibrate(50);
                        setSelectedCollection(collection);
                      }}
                      className="w-[150px] h-[220px] sm:w-[190px] sm:h-[280px] shrink-0 snap-start relative transition-all duration-200 hover:-translate-y-1 active:scale-95 group shadow-md hover:shadow-xl hover:shadow-purple-500/10 rounded-2xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 hover:border-purple-500/50 cursor-pointer transform-gpu"
                    >
                      {posterUrl ? (
                        <div className="absolute inset-0">
                          <img
                            src={getOptimizedImageUrl(posterUrl, 342)}
                            srcSet={getImageSrcSet(posterUrl)}
                            sizes="(max-width: 640px) 150px, 190px"
                            alt={collection.title}
                            loading="eager"
                            decoding="async"
                            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-zinc-950/30 group-hover:via-zinc-950/40 transition-colors duration-200" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 to-zinc-900" />
                      )}

                      <div className="relative z-10 p-4 h-full flex flex-col justify-end">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 w-fit mb-2 backdrop-blur-md">
                          Collection
                        </span>
                        <h3 className="text-white font-extrabold text-left drop-shadow-md line-clamp-2 text-sm sm:text-base leading-snug">
                          {collection.title}
                        </h3>
                        {collection.description && (
                          <p className="text-[10px] sm:text-xs text-zinc-300 mt-1 text-left line-clamp-2">
                            {collection.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </ScrollableRow>
            </div>
          </div>
        )}
{/* Quick Category Chips Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto p-1.5 mb-8 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-lg hide-scrollbar">
          <button
            onClick={() => {
              vibrate(30);
              setSelectedType("");
              clearFilters();
            }}
            className={clsx(
              "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all active:scale-95 flex items-center gap-2 border",
              selectedType === "" && !hasActiveFilters
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-transparent shadow-lg shadow-emerald-500/20"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
            )}
          >
            <Compass className="w-4 h-4" />
            <span>{t("All Catalog")}</span>
          </button>

          <button
            onClick={() => {
              vibrate(30);
              setSelectedType("movie");
              setCurrentPage(1);
            }}
            className={clsx(
              "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all active:scale-95 flex items-center gap-2 border",
              selectedType === "movie"
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-transparent shadow-lg shadow-emerald-500/20"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
            )}
          >
            <Film className="w-4 h-4" />
            <span>{t("Movies")}</span>
          </button>

          <button
            onClick={() => {
              vibrate(30);
              setSelectedType("series");
              setCurrentPage(1);
            }}
            className={clsx(
              "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all active:scale-95 flex items-center gap-2 border",
              selectedType === "series"
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-transparent shadow-lg shadow-emerald-500/20"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
            )}
          >
            <Tv className="w-4 h-4" />
            <span>{t("Series")}</span>
          </button>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(
              "px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all active:scale-95 flex items-center gap-2 border ml-auto",
              hasActiveFilters || showFilters
                ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>{t("Filters")}</span>
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>
        </div>
        {/* Grid Title */}
        <div className="flex items-center justify-between mb-6 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80 mt-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shadow-sm">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                {t('Explore Catalog')}
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
              <span>{t('Go to Home')}</span>
            </button>
          )}
        </div>
        {/* Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
          </div>
        ) : filteredAndSortedContent.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 flex flex-col items-center">
            <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-xl mb-4">{t('No content found')}</p>
            <button
              onClick={() => {
                vibrate(50);
                checkForUpdates(true).catch(console.error);
              }}
              className="px-6 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-bold border border-emerald-500/20 transition-all active:scale-95 flex items-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              {t('Refresh Library')}
            </button>
          </div>
        ) : (
          <>
            <div 
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6"
            >
              {paginatedContent.map((content) => (
                <ContentCard
                  key={content.id}
                  content={content}
                  profile={profile}
                  qualities={qualities}
                  languages={languages}
                  genres={genres}
                  onToggleFavorite={toggleFavorite}
                  onToggleWatchLater={toggleWatchLater}
                  selectedYear={selectedYear}
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
                    <span className="hidden sm:inline">{t('Previous')}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {(() => {
                      const pages = [];
                      const range = 1; // Number of pages around current page

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

                      // Always show ... at the end if not on last page
                      if (currentPage < totalPages) {
                        // Only add if last item isn't already dots
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
                    <span className="hidden sm:inline">{t('Next')}</span>
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
            <p>{t('Need help or want to renew membership?')}</p>
            <button
              onClick={() => {
                const adminPhone = standardizePhone(
                  settings?.supportNumber || "3363284466"
                ).replace("+", "");
                const msg = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || "N/A"}\n${t("Phone")}: ${profile?.phone || "N/A"}\n${t("Role & Status")}: ${String(
                  profile?.role || "Unknown",
                )
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) =>
                    c.toUpperCase(),
                  )}, ${String(profile?.status || "Unknown").replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${t("Your message/question:")}\n${t("I need help or want to renew my membership.")}`;
                window.open(
                  `https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`,
                  "_blank",
                );
              }}
              className="inline-flex items-center gap-2 text-emerald-500 hover:text-emerald-400 mt-2 font-medium cursor-pointer bg-transparent border-none"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp:{" "}
              {standardizePhone(settings?.supportNumber || "3363284466")}
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

        <Link to="/reviews" className="flex flex-col items-center gap-2 hover:scale-105 transition-transform active:scale-95 group">
          <div className="text-3xl font-bold flex items-center gap-2">
            {reviewsData.average}
            <div className="flex">
              {[1, 2, 3, 4, 5].map(star => (
                <Star key={`home-avg-star-${star}`} className={`w-5 h-5 ${star <= Math.round(Number(reviewsData.average)) ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-300 dark:text-zinc-700'}`} />
              ))}
            </div>
          </div>
          <div className="text-sm font-medium text-zinc-500 group-hover:text-emerald-500 transition-colors">
            {t("Based on %COUNT% reviews").replace("%COUNT%", reviewsData.total.toString())}
          </div>
        </Link>

        <div className="text-center text-xs text-zinc-500 dark:text-zinc-600 font-mono">
          {/* @ts-ignore */}
          v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.7.7'}
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



      {/* Collection Modal */}
      <AnimatePresence>
        {selectedCollection && (
          <motion.div
            key="collection-modal"
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 250 }}
            className="fixed inset-0 z-[100] bg-white dark:bg-zinc-950 flex flex-col overflow-hidden"
          >
            <div className="shrink-0 z-50 flex items-center justify-between gap-3 p-3.5 sm:p-5 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 shadow-md">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="w-1.5 h-6 bg-emerald-500 rounded-full shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base sm:text-xl font-bold text-zinc-900 dark:text-white truncate">
                    {selectedCollection.title}
                  </h2>
                  {selectedCollection.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate italic">
                      {selectedCollection.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={collectionSort}
                  onChange={(e) => setCollectionSort(e.target.value as any)}
                  className="bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:border-emerald-500 outline-none cursor-pointer"
                >
                  <option value="default">{t('Default Order')}</option>
                  <option value="newest">{t('Newest First')}</option>
                  <option value="az">{t('A-Z')}</option>
                </select>
                <button
                  onClick={() => {
                    setSelectedCollection(null);
                    setCollectionSort("default");
                  }}
                  className="p-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-zinc-500 dark:text-zinc-300 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div ref={collectionScrollRef} className="flex-1 overflow-y-auto max-w-7xl w-full mx-auto p-4 md:p-8">
              {selectedCollection.contentIds.length === 0 ? (
                <div className="text-center py-20 text-zinc-500">
                  <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p className="text-xl">{t('No content in this collection')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                  {(() => {
                    let items = selectedCollection.contentIds
                      .map((id) => permittedContentList.find((c) => c.id === id))
                      .filter((c): c is Content => !!c && c.status !== "draft");

                    if (collectionSort === "newest") {
                      items.sort(
                        (a, b) =>
                          new Date(b.createdAt).getTime() -
                          new Date(a.createdAt).getTime(),
                      );
                    } else if (collectionSort === "az") {
                      items.sort((a, b) => a.title.localeCompare(b.title));
                    }

                    // Always show accessible content first
                    items.sort((a, b) => {
                      const aCanPlay = getCanPlay(a) ? 1 : 0;
                      const bCanPlay = getCanPlay(b) ? 1 : 0;
                      return bCanPlay - aCanPlay;
                    });

                    return items.map((content) => (
                      <ContentCard
                        key={`modal-${content.id}`}
                        content={content}
                        profile={profile}
                        qualities={qualities}
                        languages={languages}
                        genres={genres}
                        onToggleFavorite={toggleFavorite}
                        onToggleWatchLater={toggleWatchLater}
                      />
                    ));
                  })()}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
