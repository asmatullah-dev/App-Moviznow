import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { doc, updateDoc, collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { Content, Role, Collection as AppCollection } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useContent } from '../../contexts/ContentContext';
import { useCart } from '../../contexts/CartContext';
import { usePWA } from '../../contexts/PWAContext';
import { standardizePhone } from '../../contexts/AuthContext';
import { Film, Search, Filter, MessageCircle, Clock, Heart, LogOut, User, Users, Lock, LayoutDashboard, X, ShoppingCart, Plus, ChevronLeft, ChevronRight, Download, TrendingUp, Zap, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import ConfirmModal from '../../components/ConfirmModal';
import { formatContentTitle, getContrastColor } from '../../utils/contentUtils';
import { smartSearch } from '../../utils/searchUtils';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import ContentCard from '../../components/ContentCard';
import { ScrollableRow } from '../../components/ScrollableRow';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import { useScrollRestoration } from '../../hooks/useScrollRestoration';
import { memoryStore } from '../../utils/memoryStore';

import { NotificationMenu } from '../../components/NotificationMenu';
import { UserProfileMenu } from '../../components/UserProfileMenu';
import { AdminButtons } from '../../components/AdminButtons';
import { CartButton } from '../../components/CartButton';

import { ThemeToggle } from '../../components/ThemeToggle';
import { useSettings } from '../../contexts/SettingsContext';

export default function Home({ onOpenMediaModal }: { onOpenMediaModal: () => void }) {
  useScrollRestoration('home_window_scroll', true);
  const collectionScrollRef = useScrollRestoration<HTMLDivElement>('home_selected_collection_scroll');

  const { profile, logout, toggleFavorite, toggleWatchLater } = useAuth();
  const { contentList, genres, languages, qualities, collections, loading, isOffline } = useContent();
  const { cart } = useCart();
  const { settings } = useSettings();
  const { isInstallable, installApp } = usePWA();
  const navigate = useNavigate();
  
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // ... (rest of the component)

  const [sort, setSort] = useState<'default' | 'newest' | 'year' | 'az'>('default');
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedQuality, setSelectedQuality] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const firstPageSize = 10;
  const pageSizeAfterFirst = settings?.itemsPerPage || 20;

  const [showFilters, setShowFilters] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [showWhatsappPrompt, setShowWhatsappPrompt] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [isSavingWhatsapp, setIsSavingWhatsapp] = useState(false);
  const [hasDismissedSession, setHasDismissedSession] = useState(false);
  
  const [selectedCollection, setSelectedCollection] = useState<AppCollection | null>(() => {
    return memoryStore.get('home_selected_collection') || null;
  });
  const [collectionSort, setCollectionSort] = useState<'default' | 'newest' | 'az'>('default');

  useEffect(() => {
    if (selectedCollection) {
      memoryStore.set('home_selected_collection', selectedCollection);
    } else {
      memoryStore.delete('home_selected_collection');
    }
  }, [selectedCollection]);

  const trendingCollection = useMemo(() => collections.find(c => c.title.toLowerCase() === 'trending' && (c.contentIds?.length || 0) >= 2), [collections]);
  const newlyAddedCollection = useMemo(() => collections.find(c => c.title.toLowerCase() === 'newly added' && (c.contentIds?.length || 0) >= 2), [collections]);
  const otherCollections = useMemo(() => collections.filter(c => 
    c.title.toLowerCase() !== 'trending' && 
    c.title.toLowerCase() !== 'newly added' && 
    (c.contentIds?.length || 0) >= 2
  ), [collections]);

  useModalBehavior(isLogoutModalOpen, () => setIsLogoutModalOpen(false));
  useModalBehavior(showWhatsappPrompt, () => setShowWhatsappPrompt(false));
  useModalBehavior(!!selectedCollection, () => setSelectedCollection(null));

  const clearFilters = () => {
    setSort('default');
    setSelectedType('');
    setSelectedGenre('');
    setSelectedLanguage('');
    setSelectedQuality('');
    setSelectedYear('');
    setSearch('');
    setCurrentPage(1);
    
    // Also clear session storage explicitly to be safe
    sessionStorage.removeItem('home_sort');
    sessionStorage.removeItem('home_genre');
    sessionStorage.removeItem('home_language');
    sessionStorage.removeItem('home_type');
    sessionStorage.removeItem('home_quality');
    sessionStorage.removeItem('home_year');
    sessionStorage.removeItem('home_page');
    sessionStorage.removeItem('home_search');
  };

  const hasActiveFilters = 
    sort !== 'default' || 
    selectedType !== '' || 
    selectedGenre !== '' || 
    selectedLanguage !== '' || 
    selectedQuality !== '' || 
    selectedYear !== '' || 
    search !== '';

  const hasAnyFilter = hasActiveFilters;
  
  const hideScrollingTabs = hasActiveFilters || currentPage > 1;

  useEffect(() => {
    if (profile && !profile.phone && profile.role !== 'admin' && profile.role !== 'owner' && !hasDismissedSession) {
      setShowWhatsappPrompt(true);
    }
  }, [profile, hasDismissedSession]);

  const handleSaveWhatsapp = async () => {
    if (!profile || !whatsappNumber.trim()) return;
    
    setWhatsappError(null);
    setIsSavingWhatsapp(true);

    try {
      const standardized = standardizePhone(whatsappNumber);
      if (!standardized) {
        setWhatsappError("Please enter a valid phone number");
        setIsSavingWhatsapp(false);
        return;
      }

      // Check for duplicates
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('phone', '==', standardized));
      const querySnapshot = await getDocs(q);
      
      const otherUsers = querySnapshot.docs.filter(d => d.id !== profile.uid);
      
      if (otherUsers.length > 0) {
        setWhatsappError("This WhatsApp number is already registered with another account.");
        setIsSavingWhatsapp(false);
        return;
      }

      await updateDoc(doc(db, 'users', profile.uid), {
        phone: standardized
      });
      setShowWhatsappPrompt(false);
    } catch (error) {
      console.error("Failed to save WhatsApp number", error);
      setWhatsappError("Failed to save number. Please try again.");
    } finally {
      setIsSavingWhatsapp(false);
    }
  };

  const handleDismissWhatsapp = () => {
    setShowWhatsappPrompt(false);
    setHasDismissedSession(true);
  };



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

  const uniqueYears = useMemo(() => {
    const years = new Set<number>();
    contentList.forEach(c => {
      if (c.year && !isNaN(Number(c.year))) years.add(Number(c.year));
      if (c.type === 'series' && c.seasons) {
        try {
          const seasons = Array.isArray(c.seasons) ? c.seasons : JSON.parse(c.seasons || '[]');
          seasons.forEach((s: any) => {
            if (s.year && !isNaN(Number(s.year))) years.add(Number(s.year));
          });
        } catch (e) {}
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [contentList]);

  const recentlyAddedContent = useMemo(() => {
    let result = [...contentList];
    if (profile?.role !== 'admin' && profile?.role !== 'content_manager' && profile?.role !== 'manager' && profile?.role !== 'owner') {
      result = result.filter(c => {
        if (c.status === 'draft') return false;
        if (c.status === 'selected_content') {
          return profile?.assignedContent?.some(id => id === c.id || id.startsWith(`${c.id}:`));
        }
        return true;
      });
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);
  }, [contentList, profile]);

  const getRoleColor = (role: string) => {
    switch(role) {
      case 'admin': return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30';
      case 'manager': return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
      case 'content_manager': return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30';
      case 'selected_content': return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30';
      default: return 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-500/30';
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
      case 'expired': return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30';
      case 'suspended': return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30';
      case 'pending': return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
      default: return 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-500/30';
    }
  };

  const filteredAndSortedContent = useMemo(() => {
    let result = [...contentList];

    // Filter out drafts and selected_content for non-admins and non-editors
    if (profile?.role !== 'admin' && profile?.role !== 'content_manager' && profile?.role !== 'manager' && profile?.role !== 'owner') {
      result = result.filter(c => {
        if (c.status === 'draft') return false;
        if (c.status === 'selected_content') {
          return profile?.assignedContent?.some(id => id === c.id || id.startsWith(`${c.id}:`));
        }
        return true;
      });
    }

    if (debouncedSearch) {
      result = smartSearch(result, debouncedSearch);
    }
    if (selectedType) {
      result = result.filter(c => c.type === selectedType);
    }
    if (selectedGenre) {
      result = result.filter(c => c.genreIds?.includes(selectedGenre));
    }
    if (selectedLanguage) {
      result = result.filter(c => c.languageIds?.includes(selectedLanguage));
    }
    if (selectedQuality) {
      result = result.filter(c => c.qualityId === selectedQuality);
    }
    if (selectedYear) {
      result = result.filter(c => {
        if (c.year?.toString() === selectedYear) return true;
        if (c.type === 'series' && c.seasons) {
          try {
            const seasons = Array.isArray(c.seasons) ? c.seasons : JSON.parse(c.seasons || '[]');
            return seasons.some((s: any) => s.year?.toString() === selectedYear);
          } catch (e) {}
        }
        return false;
      });
    }

    if (!debouncedSearch || sort === 'default') {
      result.sort((a, b) => {
        // For selected_content users, prioritize assigned content
        if (profile?.role === 'selected_content') {
          const aAssigned = profile.assignedContent?.some(id => id === a.id || id.startsWith(`${a.id}:`)) ? 1 : 0;
          const bAssigned = profile.assignedContent?.some(id => id === b.id || id.startsWith(`${b.id}:`)) ? 1 : 0;
          if (aAssigned !== bAssigned) return bAssigned - aAssigned;
        }

        if (sort === 'default') {
          if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
          if (a.order === undefined && b.order !== undefined) return -1;
          if (a.order !== undefined && b.order === undefined) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        } else if (sort === 'newest') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        } else if (sort === 'year') {
          return b.year - a.year;
        } else {
          return a.title.localeCompare(b.title);
        }
      });
    }

    return result;
  }, [contentList, debouncedSearch, sort, selectedType, selectedGenre, selectedLanguage, selectedQuality, selectedYear, profile]);

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
  }, [filteredAndSortedContent, currentPage, firstPageSize, pageSizeAfterFirst]);

  const isInitialMount = useRef(true);
  // Reset to page 1 when filters change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setCurrentPage(1);
  }, [debouncedSearch, sort, selectedType, selectedGenre, selectedLanguage, selectedQuality, selectedYear]);

  // Ensure current page is within bounds
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <img src="/Blacklogo.svg" alt="Logo" className="w-auto h-8 block dark:hidden" />
              <img src="/Whitelogo.svg" alt="Logo" className="w-auto h-8 hidden dark:block" />
            </div>
            <span className="text-xl font-bold tracking-tight text-emerald-500 whitespace-nowrap">
              {settings?.headerText || 'MovizNow'}
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center transition-colors border",
                hasAnyFilter
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-transparent"
              )}
              title="Search and Filters"
            >
              <Search className="w-4 h-4" />
            </button>
            {hasAnyFilter && (
              <button
                onClick={clearFilters}
                className="w-8 h-8 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20 hover:bg-red-500/20 transition-colors"
                title="Clear Filters"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {isInstallable && (
              <button
                onClick={installApp}
                className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                title="Install App"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            <AdminButtons profile={profile} />
            {profile && <NotificationMenu />}
            <CartButton />
            <UserProfileMenu onOpenLogoutModal={() => setIsLogoutModalOpen(true)} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 pt-4 pb-8">
        {/* Status Banner */}
        {profile?.status === 'pending' && (
          <div className="bg-yellow-500/10 border border-yellow-500 text-yellow-600 dark:text-yellow-500 p-4 sm:p-6 rounded-2xl mb-8 flex flex-row items-center justify-between gap-4 sm:gap-8">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg sm:text-2xl mb-1 sm:mb-2 text-yellow-600 dark:text-yellow-500">Account Pending</h3>
              <p className="text-yellow-700 dark:text-yellow-500/80 text-sm sm:text-lg font-medium">Your account activation is pending. Please Get Membership or Add any content to cart to activate your account.</p>
            </div>
            <div className="flex flex-col gap-2 sm:gap-3 min-w-[140px] sm:min-w-[220px] shrink-0">
              {profile?.role === 'user' && (
                <Link to="/top-up" className="flex items-center justify-center gap-1.5 sm:gap-2 bg-yellow-500 text-white dark:text-black px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-yellow-400 transition-all active:scale-95 shadow-lg shadow-yellow-500/20 border border-white/20">
                  Get Membership
                </Link>
              )}
              {(profile?.role === 'selected_content' || profile?.role === 'user') && (
                <Link to="/cart" className="flex items-center justify-center gap-1.5 sm:gap-2 bg-yellow-500 text-white dark:text-black px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-yellow-400 transition-all active:scale-95 shadow-lg shadow-yellow-500/20 border border-white/20">
                  <ShoppingCart className="w-3 h-3 sm:w-5 sm:h-5" /> Cart
                </Link>
              )}
              {settings?.isAdminContactEnabled !== false && (
                <button onClick={() => {
                  let supportPhone = settings?.supportNumber || '3363284466';
                  if (supportPhone.startsWith('0')) {
                    supportPhone = '92' + supportPhone.substring(1);
                  } else if (!supportPhone.startsWith('92')) {
                    supportPhone = '92' + supportPhone;
                  }
                  const adminPhone = supportPhone.replace('+', '');
                  const msg = `Hello Admin,\n\nName: ${profile?.displayName || 'Unknown'}\nEmail: ${profile?.email || 'N/A'}\nPhone: ${profile?.phone || 'N/A'}\nRole & Status: ${String(profile?.role || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}, ${String(profile?.status || 'Unknown').replace(/\b\w/g, c => c.toUpperCase())}\n\nYour message/question:\nMy account is pending and I need assistance.`;
                  window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`, '_blank');
                }} className="flex items-center justify-center gap-1.5 sm:gap-2 bg-yellow-500/10 border border-yellow-500 text-yellow-600 dark:text-yellow-500 px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-yellow-500/20 transition-all active:scale-95">
                  <MessageCircle className="w-3 h-3 sm:w-5 sm:h-5" /> Admin
                </button>
              )}
            </div>
          </div>
        )}
        {profile?.status === 'expired' && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 sm:p-6 rounded-2xl mb-8 flex flex-row items-center justify-between gap-4 sm:gap-8">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg sm:text-2xl mb-1 sm:mb-2">{profile.role === 'trial' ? 'Trial Expired' : 'Membership Expired'}</h3>
              <p className="text-red-500/80 text-sm sm:text-lg font-medium">
                {profile.role === 'trial' 
                  ? 'Your free Trial has expired. Please get Membership to continue watching.'
                  : 'Your membership has expired. Please renew to continue watching.'}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:gap-3 min-w-[140px] sm:min-w-[220px] shrink-0">
              <Link to="/top-up" className="flex items-center justify-center gap-1.5 sm:gap-2 bg-red-500 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-red-600 transition-all active:scale-95 shadow-lg shadow-red-500/20 border border-white/20">
                Renew Now
              </Link>
              {settings?.isAdminContactEnabled !== false && (
                <button onClick={() => {
                  let supportPhone = settings?.supportNumber || '3363284466';
                  if (supportPhone.startsWith('0')) {
                    supportPhone = '92' + supportPhone.substring(1);
                  } else if (!supportPhone.startsWith('92')) {
                    supportPhone = '92' + supportPhone;
                  }
                  const adminPhone = supportPhone.replace('+', '');
                  const expiryType = profile?.role === 'trial' ? 'Trial' : 'Membership';
                  const msg = `Hello Admin,\n\nName: ${profile?.displayName || 'Unknown'}\nEmail: ${profile?.email || 'N/A'}\nPhone: ${profile?.phone || 'N/A'}\nRole & Status: ${String(profile?.role || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}, ${String(profile?.status || 'Unknown').replace(/\b\w/g, c => c.toUpperCase())}\n\nYour message/question:\nMy ${expiryType} has expired and I need assistance.`;
                  window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`, '_blank');
                }} className="flex items-center justify-center gap-1.5 sm:gap-2 bg-red-500/10 border border-red-500/30 px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-red-500/20 transition-all active:scale-95">
                  <MessageCircle className="w-3 h-3 sm:w-5 sm:h-5" /> Admin
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
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
                    placeholder="Search movies & series..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                    }}
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 transition-colors duration-300"
                  />
                </div>
                
                <ScrollableRow scrollKey="scroll_filters_container" className="flex gap-3 overflow-x-auto pb-2 md:pb-0 flex-nowrap relative">
                  {hasActiveFilters && (
                    <button onClick={clearFilters} className="sticky left-0 z-10 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg px-2 py-1 text-xs flex items-center gap-1 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.5)]">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as any)}
                    className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500"
                  >
                    <option value="default">Default Order</option>
                    <option value="newest">Recently Added</option>
                    <option value="year">Release Year</option>
                    <option value="az">A-Z</option>
                  </select>
      
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500"
                  >
                    <option value="">Types</option>
                    <option value="movie">Movies</option>
                    <option value="series">Series</option>
                  </select>
      
                  <select
                    value={selectedGenre}
                    onChange={(e) => setSelectedGenre(e.target.value)}
                    className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500"
                  >
                    <option value="">Genres</option>
                    {genres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
      
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500"
                  >
                    <option value="">Languages</option>
                    {languages.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
      
                  <select
                    value={selectedQuality}
                    onChange={(e) => setSelectedQuality(e.target.value)}
                    className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500"
                  >
                    <option value="">Qualities</option>
                    {qualities.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                  </select>
      
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500"
                  >
                    <option value="">Years</option>
                    {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </ScrollableRow>
              </div>
            </motion.div>
          )}
        </AnimatePresence>        {/* Recently Viewed Section */}
        {!hideScrollingTabs && recentlyViewed.length > 0 && (
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-6 bg-indigo-500 rounded-full"></span>
                <Clock className="w-5 h-5 text-indigo-500" />
                Recently Viewed
              </h2>
            </div>
            <div className="relative group">
              <ScrollableRow scrollKey="scroll_recently_viewed"
                className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory flex-nowrap hide-scrollbar"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {recentlyViewed.slice(0, settings?.recentViewLimit || 10).map(content => (
                  <div key={content.id} className="w-[100px] sm:w-[130px] shrink-0 snap-start">
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
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <div className="flex flex-col">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-pink-500 rounded-full"></span>
                  <TrendingUp className="w-5 h-5 text-pink-500" />
                  Trending
                </h2>
                {trendingCollection.description && (
                  <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 mt-1 ml-3.5 italic">{trendingCollection.description}</p>
                )}
              </div>
            </div>
            <div className="relative group">
              <ScrollableRow scrollKey="scroll_trending" className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory flex-nowrap hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {trendingCollection.contentIds.map(id => {
                   const content = contentList.find(c => c.id === id);
                   if (!content) return null;
                   return (
                     <div key={content.id} className="w-[140px] sm:w-[180px] shrink-0 snap-start">
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
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <div className="flex flex-col">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-cyan-500 rounded-full"></span>
                  <Zap className="w-5 h-5 text-cyan-500" />
                  Newly Added
                </h2>
                {newlyAddedCollection.description && (
                  <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 mt-1 ml-3.5 italic">{newlyAddedCollection.description}</p>
                )}
              </div>
            </div>
            <div className="relative group">
              <ScrollableRow scrollKey="scroll_newly_added" className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory flex-nowrap hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {newlyAddedCollection.contentIds.map(id => {
                   const content = contentList.find(c => c.id === id);
                   if (!content) return null;
                   return (
                     <div key={content.id} className="w-[140px] sm:w-[180px] shrink-0 snap-start">
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
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                Collections
              </h2>
            </div>
            <div className="relative group">
              <ScrollableRow scrollKey="scroll_collections_overview" className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory flex-nowrap hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {otherCollections.map(collection => {
                  const firstContentId = collection.contentIds[0];
                  const firstContent = contentList.find(c => c.id === firstContentId);
                  const posterUrl = firstContent?.posterUrl || settings?.defaultAppImage;

                  return (
                    <button
                      key={collection.id}
                      onClick={() => setSelectedCollection(collection)}
                      className="w-[140px] h-[210px] sm:w-[180px] sm:h-[270px] shrink-0 snap-start relative transition-all hover:scale-[1.02] group shadow-sm cursor-pointer transform-gpu"
                    >
                      <div className="absolute -inset-[1px] bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl z-0 transition-all duration-300 group-hover:blur-sm" />
                      
                      <div className="relative h-full w-full rounded-[15px] p-[1px] bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600 z-10">
                        <div className="relative h-full w-full bg-black rounded-[14px] p-[0.5px]">
                          <div className="relative h-full w-full bg-zinc-50 dark:bg-zinc-900 rounded-[13.5px] overflow-hidden">
                            {posterUrl ? (
                               <div className="absolute inset-0">
                                 <img 
                                   src={posterUrl} 
                                   alt="" 
                                   className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                                 />
                                 <div className="absolute inset-0 bg-black/60 group-hover:bg-black/40 transition-colors" />
                               </div>
                            ) : (
                              <div className="absolute inset-0 bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900" />
                            )}
                            
                            <div className="relative z-10 p-4 h-full flex flex-col items-center justify-center border border-zinc-200/20 dark:border-zinc-700/50 rounded-2xl group-hover:border-emerald-500/50 transition-colors">
                              <h3 className="text-white font-bold text-center drop-shadow-md line-clamp-2 text-sm sm:text-lg">{collection.title}</h3>
                              {collection.description && (
                                <p className="text-[8px] sm:text-xs text-white/60 mt-1 text-center line-clamp-2 italic px-2">{collection.description}</p>
                              )}
                              <span className="text-[10px] sm:text-sm text-white/70 mt-2">{collection.contentIds.length} Contents</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </ScrollableRow>
            </div>
          </div>
        )}

        {/* Grid Title */}
        <div className="flex items-center justify-between mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2 mt-8">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
            <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
            All Contents
          </h2>
          {currentPage > 1 && (
            <button
              onClick={() => {
                setCurrentPage(1);
                clearFilters();
              }}
              className="text-sm text-emerald-500 hover:text-emerald-400 font-medium transition-colors"
            >
              Go to Home
            </button>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
          </div>
        ) : filteredAndSortedContent.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-xl">No content found</p>
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
                      setCurrentPage(prev => Math.max(1, prev - 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={currentPage === 1}
                    className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-medium hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Previous</span>
                  </button>
                  
                  <div className="flex items-center gap-1">
                    {(() => {
                      const pages = [];
                      const range = 1; // Number of pages around current page
                      
                      for (let i = 1; i <= totalPages; i++) {
                        if (
                          i === 1 || 
                          i === totalPages ||
                          (i >= currentPage - range && i <= currentPage + range)
                        ) {
                          pages.push(
                            <button
                              key={i}
                              onClick={() => {
                                setCurrentPage(i);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className={clsx(
                                "w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-sm font-medium transition-colors",
                                currentPage === i 
                                  ? "bg-emerald-500 text-white" 
                                  : "bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                              )}
                            >
                              {i}
                            </button>
                          );
                        } else if (
                          (i === currentPage - range - 1 && i > 1) || 
                          (i === totalPages - 1 && currentPage < totalPages - 2)
                        ) {
                          pages.push(<span key={`dots-${i}`} className="text-zinc-400 dark:text-zinc-600 px-1">...</span>);
                        }
                      }
                      
                      // Always show ... at the end if not on last page
                      if (currentPage < totalPages) {
                         // Only add if last item isn't already dots
                         const lastItem = pages[pages.length - 1];
                         if (lastItem && (lastItem as any).key && !(lastItem as any).key.startsWith('dots')) {
                           pages.push(<span key="final-dots" className="text-zinc-400 dark:text-zinc-600 px-1">...</span>);
                         }
                      }
                      
                      return pages;
                    })()}
                  </div>

                  <button
                    onClick={() => {
                      setCurrentPage(prev => Math.min(totalPages, prev + 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={currentPage === totalPages}
                    className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-medium hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      {settings?.isAdminContactEnabled !== false && (
        <footer className="border-t border-zinc-200 dark:border-zinc-800 py-8 text-center text-zinc-500">
          <p>Need help or want to renew membership?</p>
          <button onClick={() => {
            let supportPhone = settings?.supportNumber || '3363284466';
            if (supportPhone.startsWith('0')) {
              supportPhone = '92' + supportPhone.substring(1);
            } else if (!supportPhone.startsWith('92')) {
              supportPhone = '92' + supportPhone;
            }
            const adminPhone = supportPhone.replace('+', '');
            const msg = `Hello Admin,\n\nName: ${profile?.displayName || 'Unknown'}\nEmail: ${profile?.email || 'N/A'}\nPhone: ${profile?.phone || 'N/A'}\nRole & Status: ${String(profile?.role || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}, ${String(profile?.status || 'Unknown').replace(/\b\w/g, c => c.toUpperCase())}\n\nYour message/question:\nI need help or want to renew my membership.`;
            window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`, '_blank');
          }} className="inline-flex items-center gap-2 text-emerald-500 hover:text-emerald-400 mt-2 font-medium cursor-pointer bg-transparent border-none">
            <MessageCircle className="w-4 h-4" /> WhatsApp: {(settings?.supportNumber || '3363284466').startsWith('0') ? (settings?.supportNumber || '3363284466') : `0${settings?.supportNumber || '3363284466'}`}
          </button>
        </footer>
      )}

      <ConfirmModal
        isOpen={isLogoutModalOpen}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        onConfirm={logout}
        onCancel={() => setIsLogoutModalOpen(false)}
      />

      {showWhatsappPrompt && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full relative">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <MessageCircle className="w-8 h-8 text-emerald-500" />
              </div>
            </div>
            <h3 className="text-xl font-bold mb-2 text-center text-emerald-500">WhatsApp Number is Required</h3>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-center text-sm">
              Please enter your WhatsApp number to continue. This is required for membership updates and support.
            </p>
            <div className="space-y-4">
              {whatsappError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-500">{whatsappError}</p>
                </div>
              )}
              <input
                type="tel"
                placeholder="e.g. 03001234567"
                value={whatsappNumber}
                onChange={(e) => {
                  setWhatsappNumber(e.target.value);
                  setWhatsappError(null);
                }}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 transition-colors duration-300"
              />
              <div className="flex flex-col gap-2">
                <div className="flex gap-3">
                  {!isSavingWhatsapp && (
                    <button
                      onClick={handleDismissWhatsapp}
                      className="flex-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-bold py-3 px-4 rounded-xl transition-colors"
                    >
                      Later
                    </button>
                  )}
                  <button
                    onClick={handleSaveWhatsapp}
                    disabled={!whatsappNumber.trim() || isSavingWhatsapp}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {isSavingWhatsapp ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      'Save Number'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collection Modal */}
      <AnimatePresence>
        {selectedCollection && (
          <motion.div
            ref={collectionScrollRef}
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[100] bg-white dark:bg-zinc-950 overflow-y-auto"
          >
            <div className="sticky top-0 z-20 flex items-center justify-between p-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                    {selectedCollection.title}
                  </h2>
                  {selectedCollection.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 ml-3.5 italic">{selectedCollection.description}</p>
                  )}
                </div>
                <select
                  value={collectionSort}
                  onChange={(e) => setCollectionSort(e.target.value as any)}
                  className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500 outline-none"
                >
                  <option value="default">Default Order</option>
                  <option value="newest">Newest First</option>
                  <option value="az">A-Z</option>
                </select>
              </div>
              <button 
                onClick={() => {
                  setSelectedCollection(null);
                  setCollectionSort('default');
                }} 
                className="p-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-zinc-500 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-w-7xl mx-auto p-4 md:p-8">
              {selectedCollection.contentIds.length === 0 ? (
                <div className="text-center py-20 text-zinc-500">
                  <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p className="text-xl">No content in this collection</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                  {(() => {
                    let items = selectedCollection.contentIds
                      .map(id => contentList.find(c => c.id === id))
                      .filter((c): c is Content => !!c);
                    
                    if (collectionSort === 'newest') {
                      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    } else if (collectionSort === 'az') {
                      items.sort((a, b) => a.title.localeCompare(b.title));
                    }
                    
                    return items.map(content => (
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
