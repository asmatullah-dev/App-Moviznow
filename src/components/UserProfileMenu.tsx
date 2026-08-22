import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { usePWA } from '../contexts/PWAContext';
import { useSettings } from '../contexts/SettingsContext';
import { useUsers } from '../contexts/UsersContext';
import { 
  User, Settings, LogOut, Heart, Clock, MessageCircle, 
  Sun, Moon, Monitor, LayoutDashboard, Film, Users, Plus, Download, RefreshCw, Eye, X, Menu, Home as HomeIcon, PlayCircle, Tv, Gift, Star, Info, Phone, Award, CheckCircle2, Sparkles, LogIn, ShieldAlert
} from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import ConfirmModal from './ConfirmModal';
import { motion, AnimatePresence } from 'framer-motion';
import { useContent } from '../contexts/ContentContext';
import { useHaptics } from '../hooks/useHaptics';

export const UserProfileMenu = React.memo(({ onOpenLogoutModal }: { onOpenLogoutModal?: () => void }) => {
  const { profile, logout, refreshProfile, isSyncing } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { isInstallable, installApp } = usePWA();
  const { checkForUpdates, quickRefreshCatalog } = useContent();
  const { refreshSettings } = useSettings();
  const { refreshUsers } = useUsers();
  const { enabled: isHapticsEnabled, toggleHaptics, vibrate } = useHaptics();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({ title: '', type: 'movie' as 'movie' | 'series', year: '' });
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const { updateUserProfileData } = useAuth();
  
  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newRequest.title.trim() || submittingRequest) return;
    
    // Auto purge logic is in AuthContext but we check counts here
    const activeRequests = (profile.movieRequests || []).filter(r => r.status === 'pending').length;
    if (activeRequests >= 3) {
      alert(t("You can only have 3 pending requests at a time."));
      return;
    }
    
    setSubmittingRequest(true);
    try {
      const alreadyRequested = profile.movieRequests?.some((r: any) => 
        r.title.toLowerCase() === newRequest.title.trim().toLowerCase() && r.status === 'pending'
      );

      if (alreadyRequested) {
        alert(t("You have already requested this exact movie."));
      } else {
        const requestId = Math.floor(10000000 + Math.random() * 90000000).toString();
        const requestData = {
          id: requestId,
          title: newRequest.title.trim(),
          type: newRequest.type,
          year: newRequest.type === 'movie' ? newRequest.year?.trim() : undefined,
          status: 'pending',
          createdAt: new Date().toISOString(),
          requestedBy: [profile.uid],
          requestCount: 1
        };

        await updateUserProfileData({
          movieRequests: [...(profile.movieRequests || []), requestData]
        }, undefined, true);
        alert(t("Request submitted successfully!"));
      }

      setNewRequest({ title: '', type: 'movie', year: '' });
      setIsRequestModalOpen(false);
    } catch (error) {
      console.error("Error submitting request:", error);
      alert(t("Failed to submit request."));
    } finally {
      setSubmittingRequest(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  const triggerLogout = () => {
    setIsOpen(false);
    if (onOpenLogoutModal) {
      onOpenLogoutModal();
    } else {
      setIsLogoutModalOpen(true);
    }
  };

  // Still need profile for the popup internals, but render the button right away
  const role = profile?.role || 'user';
  const status = profile?.status || 'pending';

  const getRoleColor = (r: string) => {
    switch(r) {
      case 'admin': return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30';
      case 'owner': return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30';
      case 'vip': return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30';
      case 'basic': return 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30';
      case 'manager': return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
      case 'content_manager': return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30';
      case 'selected_content': return 'bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/30';
      case 'trial': return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
      default: return 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-500/30';
    }
  };

  const getRoleDisplayLabel = (r: string) => {
    if (r === 'vip') return 'VIP User';
    if (r === 'basic') return 'Basic User';
    if (r === 'user') return 'User';
    return r.replace('_', ' ');
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

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => {
          vibrate(30);
          setIsOpen(!isOpen);
        }}
        className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors relative overflow-hidden"
        title={isOpen ? t("Close Menu") : t("Open Menu")}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={isOpen ? 'close' : 'menu'}
            initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-center"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </motion.div>
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10, scale: 0.9, transformOrigin: 'top right' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="absolute right-0 mt-2 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-y-auto custom-scrollbar max-h-[85vh] z-50"
          >
            <div className="p-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent">
              <div className="flex items-center gap-3 mb-2.5">
                <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 p-0.5 shadow-md shadow-emerald-500/20 shrink-0">
                  <div className="w-full h-full rounded-[14px] bg-white dark:bg-zinc-900 flex items-center justify-center text-emerald-500 dark:text-emerald-400 font-bold">
                    <User className="w-5 h-5" />
                  </div>
                  <span className={clsx(
                    "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-white dark:ring-zinc-900 shadow-sm",
                    status === 'active' ? "bg-emerald-500" : status === 'expired' ? "bg-red-500" : "bg-amber-500"
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-extrabold text-sm text-zinc-900 dark:text-white truncate">{profile?.displayName || t('Guest User')}</p>
                  </div>
                  <div className="space-y-0.5">
                    {profile?.email && !profile.email.endsWith('@moviznow.com') && (
                      <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate">{profile.email}</p>
                    )}
                    {profile?.phone && (
                      <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate">{profile.phone}</p>
                    )}
                    {!profile?.phone && profile?.email?.endsWith('@moviznow.com') && (
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{t('No Contact Info')}</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className={clsx("text-[10px] font-extrabold tracking-wider px-2.5 py-0.5 rounded-lg border uppercase shadow-2xs", getRoleColor(role))}>
                  {!profile ? t('Guest') : getRoleDisplayLabel(role)}
                </span>
                {role !== 'owner' && (
                  <span className={clsx("text-[10px] font-extrabold tracking-wider px-2.5 py-0.5 rounded-lg border uppercase shadow-2xs", getStatusColor(status))}>
                    {!profile ? t('Pending') : status}
                  </span>
                )}
              </div>

              {!profile && (
                <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-transparent border border-emerald-500/30">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldAlert className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-extrabold text-xs text-zinc-900 dark:text-white">
                      {t("Login to Access All Features")}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mb-2 leading-relaxed">
                    {t("Sign in to unlock full movies, requests, and sync favorites across devices.")}
                  </p>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      navigate('/login', { state: { from: location } });
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black dark:text-zinc-950 font-black text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{t("Sign In / Register")}</span>
                  </button>
                </div>
              )}

              {role !== 'owner' && profile?.expiryDate && (
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-2.5 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{t('Expiry')}:</span>
                    <span className="font-extrabold text-xs text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/50 dark:border-zinc-700/50 px-2 py-0.5 rounded-md shadow-2xs">
                      {(() => {
                        if (profile.expiryDate === 'Lifetime') return t('Lifetime');
                        const cleanStr = profile.expiryDate.split('T')[0];
                        const parts = cleanStr.split('-');
                        if (parts.length === 3 && parts[0].length === 4) {
                          const year = parseInt(parts[0], 10);
                          const month = parseInt(parts[1], 10) - 1;
                          const day = parseInt(parts[2], 10);
                          if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                            return format(new Date(year, month, day), 'MMM dd, yyyy');
                          }
                        }
                        return format(new Date(profile.expiryDate), 'MMM dd, yyyy');
                      })()}
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      setIsOpen(false);
                      navigate('/top-up');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-[11px] font-extrabold shadow-sm shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                    title="Renew or Extend Membership"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{t('Top-Up')}</span>
                  </button>
                </div>
              )}

              {(profile?.reported_links || []).length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
                  <div className="text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>{t('Reported Links')}</span>
                    <span className="bg-zinc-200/60 dark:bg-zinc-800 px-1.5 py-0.2 rounded text-zinc-600 dark:text-zinc-300 font-bold">{profile.reported_links?.length}</span>
                  </div>
                  <div className="max-h-20 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                    {profile.reported_links!.map((report, idx) => (
                      <div key={idx} className="flex justify-between items-center text-[10px] bg-zinc-100/70 dark:bg-zinc-800/50 rounded-lg p-1.5 border border-zinc-200/40 dark:border-zinc-800/60">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate pr-2">
                          {report.contentTitle} {report.linkName || report.linkUrl}
                        </span>
                        <span className={clsx(
                          "font-bold uppercase tracking-wide shrink-0 whitespace-nowrap text-[9px]",
                          report.status === 'resolved' ? "text-emerald-500" : "text-amber-500"
                        )}>
                          {report.status ? report.status.charAt(0).toUpperCase() + report.status.slice(1).toLowerCase() : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {profile?.role !== 'manager' && profile?.role !== 'content_manager' && (
                <div className="mt-2.5 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
                  <div className="text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>{t('Movie Requests')}</span>
                    <div className="flex gap-1.5 items-center">
                       <span className="text-zinc-400 text-[10px]">{(profile?.movieRequests || []).length} / 3</span>
                       <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(false); setIsRequestModalOpen(true); }} className="p-0.5 rounded-md bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors" title="New Request">
                        <Plus className="w-3 h-3" />
                       </button>
                    </div>
                  </div>
                  {(profile?.movieRequests || []).length > 0 && (
                    <div className="max-h-20 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                      {profile!.movieRequests!.map((report: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-[10px] bg-zinc-100/70 dark:bg-zinc-800/50 rounded-lg p-1.5 border border-zinc-200/40 dark:border-zinc-800/60">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate pr-2 flex items-center gap-1">
                            {report.title} {report.type === 'series' ? '(Series)' : report.year ? `(${report.year})` : ''}
                            {report.status === 'added' && report.contentId && (
                              <button onClick={() => { setIsOpen(false); navigate(`/${report.type === 'series' ? 'series' : 'movie'}/${report.contentId}`); }} className="p-0.5 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20" title="View Content">
                                <Eye className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                          <span className={clsx(
                            "font-bold uppercase tracking-wide shrink-0 whitespace-nowrap text-[9px]",
                            report.status === 'added' ? "text-emerald-500" : report.status === 'rejected' ? "text-red-500" : "text-amber-500"
                          )}>
                            {report.status ? report.status.charAt(0).toUpperCase() + report.status.slice(1).toLowerCase() : 'Pending'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-2 space-y-0.5">
                {/* Navigation Section */}
                <div className="px-2 pt-1 pb-1 text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                  {t('Navigation')}
                </div>
                <Link to="/" onClick={() => setIsOpen(false)} className={clsx("group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all", location.pathname === "/" && !searchParams.get("type") ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-xs font-bold" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60")}>
                  <HomeIcon className={clsx("w-4 h-4 transition-transform group-hover:scale-110", location.pathname === "/" && !searchParams.get("type") ? "text-emerald-500" : "text-zinc-400")} /> 
                  <span>{t("Home")}</span>
                  {location.pathname === "/" && !searchParams.get("type") && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" />}
                </Link>
                <Link to="/?type=movie" onClick={() => setIsOpen(false)} className={clsx("group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all", location.pathname === "/" && searchParams.get("type") === "movie" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-xs font-bold" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60")}>
                  <Film className={clsx("w-4 h-4 transition-transform group-hover:scale-110", location.pathname === "/" && searchParams.get("type") === "movie" ? "text-emerald-500" : "text-zinc-400")} /> 
                  <span>{t("Movies")}</span>
                  {location.pathname === "/" && searchParams.get("type") === "movie" && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" />}
                </Link>
                <Link to="/?type=series" onClick={() => setIsOpen(false)} className={clsx("group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all", location.pathname === "/" && searchParams.get("type") === "series" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-xs font-bold" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60")}>
                  <Tv className={clsx("w-4 h-4 transition-transform group-hover:scale-110", location.pathname === "/" && searchParams.get("type") === "series" ? "text-emerald-500" : "text-zinc-400")} /> 
                  <span>{t("Web Series")}</span>
                  {location.pathname === "/" && searchParams.get("type") === "series" && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" />}
                </Link>
                <Link to="/freemovies" onClick={() => setIsOpen(false)} className={clsx("group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all", location.pathname === "/freemovies" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-xs font-bold" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60")}>
                  <PlayCircle className={clsx("w-4 h-4 transition-transform group-hover:scale-110", location.pathname === "/freemovies" ? "text-emerald-500" : "text-zinc-400")} /> 
                  <span>{t("Free Movies")}</span>
                  {location.pathname === "/freemovies" && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" />}
                </Link>
                <Link to="/membership" onClick={() => setIsOpen(false)} className={clsx("group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all", location.pathname === "/membership" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-xs font-bold" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60")}>
                  <Gift className={clsx("w-4 h-4 transition-transform group-hover:scale-110", location.pathname === "/membership" ? "text-emerald-500" : "text-zinc-400")} /> 
                  <span>{t("Membership")}</span>
                  {location.pathname === "/membership" && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" />}
                </Link>
                <Link to="/rewards" onClick={() => setIsOpen(false)} className={clsx("group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all", location.pathname === "/rewards" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-xs font-bold" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60")}>
                  <Award className={clsx("w-4 h-4 transition-transform group-hover:scale-110", location.pathname === "/rewards" ? "text-emerald-500" : "text-zinc-400")} /> 
                  <span>{t("Rewards")}</span>
                  {location.pathname === "/rewards" && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" />}
                </Link>
                <Link to="/reviews" onClick={() => setIsOpen(false)} className={clsx("group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all", location.pathname === "/reviews" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-xs font-bold" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60")}>
                  <Star className={clsx("w-4 h-4 transition-transform group-hover:scale-110", location.pathname === "/reviews" ? "text-emerald-500" : "text-zinc-400")} /> 
                  <span>{t("Reviews")}</span>
                  {location.pathname === "/reviews" && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" />}
                </Link>

                {/* Library Section */}
                <div className="px-2 pt-2 pb-1 text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                  {t('Saved')}
                </div>
                <Link to="/watch-later" onClick={() => setIsOpen(false)} className={clsx("group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all", location.pathname === "/watch-later" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 font-bold" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60")}>
                  <Clock className="w-4 h-4 text-zinc-400 group-hover:text-emerald-500 transition-colors" /> 
                  <span>{t('Watch Later')}</span>
                </Link>
                <Link to="/favorites" onClick={() => setIsOpen(false)} className={clsx("group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all", location.pathname === "/favorites" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 font-bold" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60")}>
                  <Heart className="w-4 h-4 text-zinc-400 group-hover:text-red-500 transition-colors" /> 
                  <span>{t('Favorites')}</span>
                </Link>

                {/* Preferences Section */}
                <div className="px-2 pt-2 pb-1 text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                  {t('Preferences')}
                </div>

                {/* Theme Switcher */}
                <div className="px-3 py-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{t('Theme')}</span>
                  <div className="flex bg-zinc-100 dark:bg-zinc-800/90 rounded-xl p-1 border border-zinc-200/50 dark:border-zinc-700/50">
                    <button
                      onClick={() => setTheme('light')}
                      className={clsx(
                        "p-1.5 rounded-lg transition-all cursor-pointer",
                        theme === 'light' ? "bg-white dark:bg-zinc-700 shadow-xs text-emerald-500 font-bold" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
                      )}
                      title="Light"
                    >
                      <Sun className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setTheme('dark')}
                      className={clsx(
                        "p-1.5 rounded-lg transition-all cursor-pointer",
                        theme === 'dark' ? "bg-white dark:bg-zinc-700 shadow-xs text-emerald-500 font-bold" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
                      )}
                      title="Dark"
                    >
                      <Moon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setTheme('system')}
                      className={clsx(
                        "p-1.5 rounded-lg transition-all cursor-pointer",
                        theme === 'system' ? "bg-white dark:bg-zinc-700 shadow-xs text-emerald-500 font-bold" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
                      )}
                      title="System"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Language Switcher */}
                <div className="px-3 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{t('Language')}</span>
                  <div className="flex bg-zinc-100 dark:bg-zinc-800/90 rounded-xl p-1 border border-zinc-200/50 dark:border-zinc-700/50">
                    <button
                      onClick={() => setLanguage('en')}
                      className={clsx(
                        "px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer",
                        language === 'en' ? "bg-white dark:bg-zinc-700 shadow-xs text-emerald-500" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
                      )}
                    >
                      EN
                    </button>
                    <button
                      onClick={() => setLanguage('ur-roman')}
                      className={clsx(
                        "px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer",
                        language === 'ur-roman' ? "bg-white dark:bg-zinc-700 shadow-xs text-emerald-500" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
                      )}
                    >
                      Roman
                    </button>
                    <button
                      onClick={() => setLanguage('ur')}
                      className={clsx(
                        "px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer",
                        language === 'ur' ? "bg-white dark:bg-zinc-700 shadow-xs text-emerald-500" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
                      )}
                    >
                      اردو
                    </button>
                  </div>
                </div>

                {/* Haptics Switch */}
                <div className="px-3 py-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{t('Haptics')}</span>
                  <button
                    onClick={toggleHaptics}
                    className={clsx(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      isHapticsEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={clsx(
                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out",
                        isHapticsEnabled ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                {/* Quick Links & Info */}
                <div className="px-2 pt-2 pb-1 text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                  {t('App & Account')}
                </div>
                <Link to="/about" onClick={() => setIsOpen(false)} className={clsx("group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all", location.pathname === "/about" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-bold" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60")}>
                  <Info className="w-4 h-4 text-zinc-400 group-hover:text-emerald-500 transition-colors" /> 
                  <span>{t("About")}</span>
                </Link>
                <Link to="/contact" onClick={() => setIsOpen(false)} className={clsx("group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all", location.pathname === "/contact" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-bold" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60")}>
                  <Phone className="w-4 h-4 text-zinc-400 group-hover:text-emerald-500 transition-colors" /> 
                  <span>{t("Contact")}</span>
                </Link>
                <Link to="/settings" onClick={() => setIsOpen(false)} className={clsx("group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all", location.pathname === "/settings" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-bold" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60")}>
                  <Settings className="w-4 h-4 text-zinc-400 group-hover:text-emerald-500 transition-colors" /> 
                  <span>{t('Settings')}</span>
                </Link>

                {isInstallable && (
                  <button 
                    onClick={() => {
                      setIsOpen(false);
                      installApp();
                    }} 
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" /> 
                    <span>{t('Install App')}</span>
                  </button>
                )}

                <div className="pt-2 mt-2 border-t border-zinc-200/80 dark:border-zinc-800/80 space-y-1">
                  <button 
                    id="user-profile-refresh-app-data-btn"
                    disabled={isSyncing || isRefreshingData}
                    onClick={async () => {
                      if (isSyncing || isRefreshingData) return;
                      vibrate(50);
                      setIsRefreshingData(true);
                      try {
                        if ((window as any).triggerSyncUserData) {
                          await (window as any).triggerSyncUserData('manual');
                        }
                        if ((window as any).triggerRefreshAppData) {
                          await (window as any).triggerRefreshAppData('user_profile_button');
                        } else {
                          await Promise.all([
                            quickRefreshCatalog(true),
                            refreshProfile(true, 'manual'),
                            refreshSettings()
                          ]);
                        }
                      } catch (err) {
                        console.error("Error refreshing app data:", err);
                      } finally {
                        setIsRefreshingData(false);
                        setIsOpen(false);
                      }
                    }} 
                    className={clsx(
                      "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer",
                      (isSyncing || isRefreshingData) 
                        ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 cursor-not-allowed opacity-90"
                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                    )}
                    title="Refresh Content & Account Sync"
                  >
                    <div className="flex items-center gap-2.5">
                      <RefreshCw className={clsx("w-3.5 h-3.5", (isSyncing || isRefreshingData) ? "animate-spin text-emerald-500" : "text-zinc-400")} /> 
                      <span>{(isSyncing || isRefreshingData) ? t("Refreshing...") : t("Refresh App Data")}</span>
                    </div>
                  </button>

                  {!profile ? (
                    <button
                      onClick={() => {
                        setIsOpen(false);
                        navigate('/login', { state: { from: location } });
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-black text-black bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-md shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>{t('Sign In / Register')}</span>
                    </button>
                  ) : (
                    <button 
                      onClick={handleLogout} 
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" /> 
                      <span>{t('Sign Out')}</span>
                    </button>
                  )}
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {typeof document !== 'undefined' && document.body && createPortal(
        <AnimatePresence>
          {isRequestModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-md"
                onClick={() => setIsRequestModalOpen(false)}
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 15 }}
                transition={{ type: "spring", damping: 24, stiffness: 320 }}
                className="relative my-auto w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] z-10"
              >
              <div className="p-4 sm:p-5 border-b border-zinc-200/80 dark:border-zinc-800/80 flex justify-between items-center bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/25 shrink-0">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-zinc-900 dark:text-white leading-tight">
                      {newRequest.type === 'series' ? t("Request Series") : t("Request Movie")}
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">{t("Tell us what you want to watch")}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsRequestModalOpen(false)} 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 sm:p-5 overflow-y-auto">
                <form onSubmit={handleRequestSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">{t("Title")}</label>
                    <input
                      type="text"
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-2xs"
                      placeholder="e.g. Inception, Avatar..."
                      value={newRequest.title}
                      onChange={e => setNewRequest({...newRequest, title: e.target.value})}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">{t("Type")}</label>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 dark:bg-zinc-950 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60">
                      <button 
                        type="button" 
                        onClick={() => setNewRequest({...newRequest, type: 'movie'})} 
                        className={clsx(
                          "py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer", 
                          newRequest.type === 'movie' 
                            ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm font-extrabold" 
                            : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                        )}
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>{t("Movie")}</span>
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setNewRequest({...newRequest, type: 'series'})} 
                        className={clsx(
                          "py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer", 
                          newRequest.type === 'series' 
                            ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm font-extrabold" 
                            : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                        )}
                      >
                        <Tv className="w-3.5 h-3.5" />
                        <span>{t("Series")}</span>
                      </button>
                    </div>
                  </div>

                  {newRequest.type === 'movie' && (
                    <div>
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">{t("Year")}</label>
                      <input
                        type="text"
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-2xs"
                        placeholder="e.g. 2024"
                        value={newRequest.year}
                        onChange={e => setNewRequest({...newRequest, year: e.target.value})}
                        required
                      />
                    </div>
                  )}

                  <div className="flex gap-2.5 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setIsRequestModalOpen(false)} 
                      className="flex-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold py-3 rounded-2xl transition-all text-xs active:scale-95 cursor-pointer"
                    >
                      {t("Cancel")}
                    </button>
                    <button 
                      type="submit" 
                      disabled={submittingRequest || !newRequest.title.trim() || (newRequest.type === 'movie' && !newRequest.year)} 
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold py-3 rounded-2xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/25 active:scale-95 text-xs cursor-pointer"
                    >
                      {submittingRequest ? t("Submitting...") : t("Submit Request")}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
});
