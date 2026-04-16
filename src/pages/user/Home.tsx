import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Content, Role } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useContent } from '../../contexts/ContentContext';
import { useCart } from '../../contexts/CartContext';
import { usePWA } from '../../contexts/PWAContext';
import { Film, Search, Filter, MessageCircle, Clock, Heart, LogOut, User, Users, Lock, LayoutDashboard, X, ShoppingCart, Plus, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import ConfirmModal from '../../components/ConfirmModal';
import { formatContentTitle, getContrastColor } from '../../utils/contentUtils';
import { smartSearch } from '../../utils/searchUtils';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import ContentCard from '../../components/ContentCard';
import { useModalBehavior } from '../../hooks/useModalBehavior';

import { NotificationMenu } from '../../components/NotificationMenu';
import { UserProfileMenu } from '../../components/UserProfileMenu';
import { AdminButtons } from '../../components/AdminButtons';
import { CartButton } from '../../components/CartButton';

import { ThemeToggle } from '../../components/ThemeToggle';
import { useSettings } from '../../contexts/SettingsContext';

export default function Home({ onOpenMediaModal }: { onOpenMediaModal: () => void }) {
  const { profile, logout, toggleFavorite, toggleWatchLater } = useAuth();
  const { contentList, genres, languages, qualities, loading, isOffline } = useContent();
  const { cart } = useCart();
  const { settings } = useSettings();
  const { isInstallable, installApp } = usePWA();
  const navigate = useNavigate();
  
  const [search, setSearch] = useState(() => sessionStorage.getItem('home_search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  
  // ... (rest of the component)

  const searchSuggestions = useMemo(() => {
    if (!debouncedSearch.trim()) return [];
    return smartSearch(contentList, debouncedSearch).slice(0, 5);
  }, [debouncedSearch, contentList]);

  useEffect(() => {
    sessionStorage.setItem('home_search', debouncedSearch);
  }, [debouncedSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current && 
        !suggestionsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [sort, setSort] = useState<'default' | 'newest' | 'year' | 'az'>(() => (sessionStorage.getItem('home_sort') as any) || 'default');
  const [selectedGenre, setSelectedGenre] = useState<string>(() => sessionStorage.getItem('home_genre') || '');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => sessionStorage.getItem('home_language') || '');
  const [selectedType, setSelectedType] = useState<string>(() => sessionStorage.getItem('home_type') || '');
  const [selectedQuality, setSelectedQuality] = useState<string>(() => sessionStorage.getItem('home_quality') || '');
  const [selectedYear, setSelectedYear] = useState<string>(() => sessionStorage.getItem('home_year') || '');
  const [currentPage, setCurrentPage] = useState(() => parseInt(sessionStorage.getItem('home_page') || '1', 10));

  useEffect(() => {
    sessionStorage.setItem('home_sort', sort);
    sessionStorage.setItem('home_genre', selectedGenre);
    sessionStorage.setItem('home_language', selectedLanguage);
    sessionStorage.setItem('home_type', selectedType);
    sessionStorage.setItem('home_quality', selectedQuality);
    sessionStorage.setItem('home_year', selectedYear);
    sessionStorage.setItem('home_page', currentPage.toString());
  }, [sort, selectedGenre, selectedLanguage, selectedType, selectedQuality, selectedYear, currentPage]);
  const ITEMS_PER_PAGE = settings?.itemsPerPage || 20;
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [showWhatsappPrompt, setShowWhatsappPrompt] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [hasDismissedSession, setHasDismissedSession] = useState(false);

  useModalBehavior(isLogoutModalOpen, () => setIsLogoutModalOpen(false));
  useModalBehavior(showWhatsappPrompt, () => setShowWhatsappPrompt(false));

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

  const hasFiltersOrPagination = 
    sort !== 'default' || 
    selectedType !== '' || 
    selectedGenre !== '' || 
    selectedLanguage !== '' || 
    selectedQuality !== '' || 
    selectedYear !== '' || 
    search !== '' || 
    currentPage > 1;

  useEffect(() => {
    if (profile && !profile.phone && profile.role !== 'admin' && profile.role !== 'content_manager' && profile.role !== 'manager' && profile.role !== 'owner' && !hasDismissedSession) {
      // Check if we just came back from MovieDetails
      const cameFromDetails = sessionStorage.getItem('from_movie_details') === 'true';
      if (cameFromDetails) {
        setShowWhatsappPrompt(true);
        sessionStorage.removeItem('from_movie_details');
      } else if (profile.phone === undefined) {
        // Initial prompt for new users who haven't even dismissed it once
        setShowWhatsappPrompt(true);
      }
    }
  }, [profile, hasDismissedSession]);

  const handleSaveWhatsapp = () => {
    if (!profile) return;
    setShowWhatsappPrompt(false);
    updateDoc(doc(db, 'users', profile.uid), {
      phone: whatsappNumber
    }).catch(error => console.error("Failed to save WhatsApp number", error));
  };

  const handleDismissWhatsapp = () => {
    setShowWhatsappPrompt(false);
    setHasDismissedSession(true);
  };

  const handleNeverShowAgain = () => {
    if (!profile) return;
    setShowWhatsappPrompt(false);
    setHasDismissedSession(true);
    updateDoc(doc(db, 'users', profile.uid), {
      phone: '' // Save empty string to indicate never show again
    }).catch(error => console.error("Failed to dismiss WhatsApp prompt", error));
  };

  useEffect(() => {
    let timeoutId: number | null = null;
    const handleScroll = () => {
      if (timeoutId) return;
      timeoutId = window.setTimeout(() => {
        sessionStorage.setItem('homeScrollPosition', window.scrollY.toString());
        timeoutId = null;
      }, 500); // Throttle to every 500ms
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (contentList.length > 0) {
      const savedScrollPosition = sessionStorage.getItem('homeScrollPosition');
      if (savedScrollPosition) {
        // Use a small delay to ensure the grid has rendered
        const timer = setTimeout(() => {
          window.scrollTo({
            top: parseInt(savedScrollPosition, 10),
            behavior: 'instant'
          });
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [contentList.length]);

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

  const totalPages = Math.ceil(filteredAndSortedContent.length / ITEMS_PER_PAGE);
  const paginatedContent = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedContent.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAndSortedContent, currentPage]);

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
          <Link to="/" className="text-2xl font-bold text-emerald-500 flex items-center gap-3">
            <LazyLoadImage src="/logo.svg?v=2" alt="Logo" className="w-8 h-8" />
            <span className="tracking-tight">{settings?.headerText || 'MovizNow'}</span>
          </Link>

          <div className="flex items-center gap-2">
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
              <a href={`https://wa.me/92${settings?.supportNumber || '3363284466'}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 sm:gap-2 bg-yellow-500/10 border border-yellow-500 text-yellow-600 dark:text-yellow-500 px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-yellow-500/20 transition-all active:scale-95">
                <MessageCircle className="w-3 h-3 sm:w-5 sm:h-5" /> Admin
              </a>
            </div>
          </div>
        )}
        {profile?.status === 'expired' && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 sm:p-6 rounded-2xl mb-8 flex flex-row items-center justify-between gap-4 sm:gap-8">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg sm:text-2xl mb-1 sm:mb-2">Membership Expired</h3>
              <p className="text-red-500/80 text-sm sm:text-lg font-medium">Your membership has expired. Please renew to continue watching.</p>
            </div>
            <div className="flex flex-col gap-2 sm:gap-3 min-w-[140px] sm:min-w-[220px] shrink-0">
              <Link to="/top-up" className="flex items-center justify-center gap-1.5 sm:gap-2 bg-red-500 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-red-600 transition-all active:scale-95 shadow-lg shadow-red-500/20 border border-white/20">
                Renew Now
              </Link>
              <a href={`https://wa.me/92${settings?.supportNumber || '3363284466'}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 sm:gap-2 bg-red-500/10 border border-red-500/30 px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold hover:bg-red-500/20 transition-all active:scale-95">
                <MessageCircle className="w-3 h-3 sm:w-5 sm:h-5" /> Admin
              </a>
            </div>
          </div>
        )}

        {/* Recently Viewed Section */}
        {recentlyViewed.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] font-bold text-zinc-500 flex items-center gap-2 uppercase tracking-wider">
                <Clock className="w-3 h-3 text-indigo-500" />
                Recently Viewed
              </h2>
            </div>
            <div className="relative group">
              <div 
                className="flex overflow-x-auto gap-3 pb-3 snap-x snap-mandatory hide-scrollbar"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {recentlyViewed.slice(0, settings?.recentViewLimit || 10).map(content => {
                  const qualityObj = qualities.find(q => q.id === content.qualityId);
                  const contentLangs = languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name).join(', ');
                  const contentGenres = genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', ');
                  const isAssigned = profile?.role === 'selected_content' && profile.assignedContent?.some((id: string) => id === content.id || id.startsWith(`${content.id}:`));
                  const isLocked = profile?.status !== 'active' || (profile?.role === 'selected_content' && !isAssigned);
                  const isPending = profile?.status === 'pending';
                  
                  return (
                    <Link
                      key={content.id}
                      to={`/movie/${content.id}`}
                      className="flex-none w-[80px] sm:w-[100px] snap-start group/card relative rounded-xl overflow-hidden bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/50 transition-all duration-300 shadow-md transform-gpu"
                    >
                      <div className="aspect-[2/3] relative">
                        <LazyLoadImage
                          src={content.posterUrl || settings?.defaultAppImage || 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=300&q=80'}
                          alt={content.title}
                          effect="blur"
                          threshold={300}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                          wrapperClassName="w-full h-full"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-80 group-hover/card:opacity-100 transition-opacity" />
                        
                        <div className="absolute top-1 left-1 flex flex-col gap-0.5 z-10">
                          <span className={clsx(
                            "px-1 py-0.5 rounded text-[6px] font-bold uppercase tracking-wider backdrop-blur-md border text-white",
                            content.type === 'movie' 
                              ? "bg-blue-500/80 border-blue-500/30"
                              : "bg-purple-500/80 border-purple-500/30"
                          )}>
                            {content.type}
                          </span>
                          {qualityObj && (
                            <span 
                              className="px-1 py-0.5 rounded text-[6px] font-bold shadow-sm"
                              style={{ 
                                backgroundColor: qualityObj.color || '#34d399',
                                color: getContrastColor(qualityObj.color || '#34d399')
                              }}
                            >
                              {qualityObj.name}
                            </span>
                          )}
                        </div>

                        {isLocked && (
                          <div className={clsx(
                            "absolute top-1 right-1 px-1 py-0.5 rounded text-[6px] font-bold uppercase tracking-wider flex items-center gap-0.5 shadow-lg z-20",
                            isPending ? "bg-yellow-500 text-white dark:text-black" : "bg-red-500 text-white"
                          )}>
                            <Lock className="w-1.5 h-1.5" />
                            {isPending ? 'PND' : 'RES'}
                          </div>
                        )}
                      </div>
                      
                      <div className="p-1">
                        <h3 className="text-[8px] font-bold text-zinc-900 dark:text-white mb-0.5 group-hover/card:text-emerald-500 transition-colors">
                          {formatContentTitle(content)}
                        </h3>
                        <div className="flex flex-col gap-0.5 text-[8px] text-zinc-500 dark:text-zinc-400">
                          <div className="flex items-center justify-between">
                            <span>{content.year}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
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
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 transition-colors duration-300"
            />
            {showSuggestions && searchSuggestions.length > 0 && (
              <div 
                ref={suggestionsRef}
                className="absolute z-50 w-full mt-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto"
              >
                <div className="p-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">Suggestions</div>
                {searchSuggestions.map(suggestion => (
                  <div 
                    key={suggestion.id} 
                    className="px-4 py-3 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer flex items-center gap-3 transition-colors"
                    onClick={() => {
                      setSearch(suggestion.title);
                      setShowSuggestions(false);
                      navigate(`/movie/${suggestion.id}`);
                    }}
                  >
                    {suggestion.posterUrl ? (
                      <img src={suggestion.posterUrl} alt={suggestion.title} className="w-8 h-12 object-cover rounded" />
                    ) : (
                      <div className="w-8 h-12 bg-zinc-100 dark:bg-zinc-800 rounded flex items-center justify-center">
                        <Film className="w-4 h-4 text-zinc-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-200">{formatContentTitle(suggestion)}</div>
                      <div className="text-xs text-zinc-500 capitalize mt-0.5">
                        {suggestion.type} • {suggestion.year}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0 flex-nowrap relative">
            {hasFiltersOrPagination && (
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
          </div>
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
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                      // Show limited page numbers for better UI
                      const isFirst = page === 1;
                      const isLast = page === totalPages;
                      const isNear = page >= currentPage - 1 && page <= currentPage + 1;
                      
                      if (isFirst || isLast || isNear) {
                        return (
                          <button
                            key={page}
                            onClick={() => {
                              setCurrentPage(page);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className={clsx(
                              "w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-sm font-medium transition-colors",
                              currentPage === page 
                                ? "bg-emerald-500 text-white" 
                                : "bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                            )}
                          >
                            {page}
                          </button>
                        );
                      } else if (
                        page === currentPage - 2 || 
                        page === currentPage + 2
                      ) {
                        return <span key={page} className="text-zinc-400 dark:text-zinc-600 px-0.5 sm:px-1">...</span>;
                      }
                      return null;
                    })}
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
                <p className="text-[10px] sm:text-xs text-zinc-500 font-medium">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedContent.length)} of {filteredAndSortedContent.length} contents
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-8 text-center text-zinc-500">
        <p>Need help or want to renew membership?</p>
        <a href={`https://wa.me/92${settings?.supportNumber || '3363284466'}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-emerald-500 hover:text-emerald-400 mt-2 font-medium">
          <MessageCircle className="w-4 h-4" /> WhatsApp: 0{settings?.supportNumber || '3363284466'}
        </a>
      </footer>

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
            <h3 className="text-xl font-bold mb-2 text-center">Add WhatsApp / Phone Number</h3>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-center text-sm">
              Please provide your WhatsApp number so we can contact you regarding your membership and updates.
            </p>
            <div className="space-y-4">
              <input
                type="tel"
                placeholder="e.g. +923001234567"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 transition-colors duration-300"
              />
              <div className="flex flex-col gap-2">
                <div className="flex gap-3">
                  <button
                    onClick={handleDismissWhatsapp}
                    className="flex-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-bold py-3 px-4 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveWhatsapp}
                    disabled={!whatsappNumber.trim()}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-colors"
                  >
                    Save
                  </button>
                </div>
                <button
                  onClick={handleNeverShowAgain}
                  className="text-[10px] text-zinc-500 hover:text-zinc-500 dark:text-zinc-400 transition-colors"
                >
                  Don't show again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
