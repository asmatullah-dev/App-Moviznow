import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePWA } from '../contexts/PWAContext';
import { useSettings } from '../contexts/SettingsContext';
import { useUsers } from '../contexts/UsersContext';
import { 
  User, Settings, LogOut, Heart, Clock, MessageCircle, 
  Sun, Moon, Monitor, LayoutDashboard, Film, Users, Plus, Download, RefreshCw, Eye, X
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
  const { isInstallable, installApp } = usePWA();
  const { checkForUpdates } = useContent();
  const { refreshSettings } = useSettings();
  const { refreshUsers } = useUsers();
  const { enabled: isHapticsEnabled, toggleHaptics, vibrate } = useHaptics();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
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
      alert(`You can only have 3 pending requests at a time.`);
      return;
    }
    
    setSubmittingRequest(true);
    try {
      const alreadyRequested = profile.movieRequests?.some((r: any) => 
        r.title.toLowerCase() === newRequest.title.trim().toLowerCase() && r.status === 'pending'
      );

      if (alreadyRequested) {
        alert("You have already requested this exact movie.");
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
        alert("Request submitted successfully!");
      }

      setNewRequest({ title: '', type: 'movie', year: '' });
      setIsRequestModalOpen(false);
    } catch (error) {
      console.error("Error submitting request:", error);
      alert("Failed to submit request.");
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
      case 'manager': return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
      case 'content_manager': return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30';
      case 'selected_content': return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30';
      case 'trial': return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
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

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
      >
        <User className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-y-auto custom-scrollbar max-h-[85vh] z-50"
          >
            {/* User Details Header */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 shrink-0">
                  <User className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 dark:text-white truncate">{profile?.displayName || 'Loading...'}</p>
                  <div className="space-y-0.5">
                    {profile?.email && !profile.email.endsWith('@moviznow.com') && (
                      <p className="text-[10px] text-zinc-500 truncate">{profile.email}</p>
                    )}
                    {profile?.phone && (
                      <p className="text-[10px] text-zinc-500 truncate">{profile.phone}</p>
                    )}
                    {!profile?.phone && profile?.email?.endsWith('@moviznow.com') && (
                      <p className="text-[10px] text-zinc-500 truncate">No Contact Info</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 mb-2">
                <span className={clsx("text-[10px] font-medium px-2 py-0.5 rounded-full border", getRoleColor(role))}>
                  {role.replace('_', ' ').toUpperCase()}
                </span>
                {role !== 'owner' && (
                  <span className={clsx("text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase", getStatusColor(status))}>
                    {status}
                  </span>
                )}
              </div>

              {role !== 'owner' && profile?.expiryDate && (
                <div className="text-xs text-zinc-500 mt-2 flex items-center justify-between">
                  <div>
                    Expiry: <span className="font-medium text-zinc-900 dark:text-white">{profile.expiryDate === 'Lifetime' ? 'Lifetime' : format(new Date(profile.expiryDate), 'MMM dd, yyyy')}</span>
                  </div>
                  <button 
                    onClick={() => {
                      setIsOpen(false);
                      navigate('/top-up');
                    }}
                    className="p-1 rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                    title="Renew or Extend Membership"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              )}

              {(profile?.reported_links || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-200/50 dark:border-zinc-700/50">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Reported Links</span>
                    <span className="text-zinc-400">{profile.reported_links?.length}</span>
                  </div>
                  <div className="max-h-24 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                    {profile.reported_links!.map((report, idx) => (
                      <div key={idx} className="flex justify-between items-center text-[10px] bg-white/50 dark:bg-zinc-900/50 rounded-lg p-1.5 border border-zinc-100 dark:border-zinc-800">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-200 truncate pr-2">
                          {report.contentTitle} {report.linkName || report.linkUrl}
                        </span>
                        <span className={clsx(
                          "font-bold uppercase tracking-wide shrink-0 whitespace-nowrap",
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
                <div className="mt-3 pt-3 border-t border-zinc-200/50 dark:border-zinc-700/50">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Movie Requests</span>
                    <div className="flex gap-2 items-center">
                       <span className="text-zinc-400">{(profile?.movieRequests || []).length} / 3</span>
                       <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(false); setIsRequestModalOpen(true); }} className="p-0.5 rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"><Plus className="w-3 h-3" /></button>
                    </div>
                  </div>
                  {(profile?.movieRequests || []).length > 0 && (
                    <div className="max-h-24 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                      {profile!.movieRequests!.map((report: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-[10px] bg-white/50 dark:bg-zinc-900/50 rounded-lg p-1.5 border border-zinc-100 dark:border-zinc-800 group relative">
                          <span className="font-semibold text-zinc-700 dark:text-zinc-200 truncate pr-2 flex items-center gap-1">
                            {report.title} {report.type === 'series' ? 'Series' : report.year}
                            {report.status === 'added' && report.contentId && (
                              <button onClick={() => { setIsOpen(false); navigate(`/${report.type === 'series' ? 'series' : 'movie'}/${report.contentId}`); }} className="p-0.5 rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20" title="View Content">
                                <Eye className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={clsx(
                              "font-bold uppercase tracking-wide shrink-0 whitespace-nowrap",
                              report.status === 'added' ? "text-emerald-500" : report.status === 'rejected' ? "text-red-500" : "text-amber-500"
                            )}>
                              {report.status ? report.status.charAt(0).toUpperCase() + report.status.slice(1).toLowerCase() : 'Pending'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-2 space-y-1">
              {/* Theme Toggle */}
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Theme</span>
                <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                  <button
                    onClick={() => setTheme('light')}
                    className={clsx(
                      "p-1.5 rounded-md transition-colors",
                      theme === 'light' ? "bg-white dark:bg-zinc-700 shadow-sm text-emerald-500" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                    )}
                    title="Light"
                  >
                    <Sun className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={clsx(
                      "p-1.5 rounded-md transition-colors",
                      theme === 'dark' ? "bg-white dark:bg-zinc-700 shadow-sm text-emerald-500" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                    )}
                    title="Dark"
                  >
                    <Moon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setTheme('system')}
                    className={clsx(
                      "p-1.5 rounded-md transition-colors",
                      theme === 'system' ? "bg-white dark:bg-zinc-700 shadow-sm text-emerald-500" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                    )}
                    title="System"
                  >
                    <Monitor className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Haptics</span>
                <button
                  onClick={toggleHaptics}
                  className={clsx(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent focus:outline-none transition-colors duration-200 ease-in-out",
                    isHapticsEnabled ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-700"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      isHapticsEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1"></div>

              <Link to="/watch-later" onClick={() => setIsOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <Clock className="w-4 h-4 text-zinc-400" /> Watch Later
              </Link>
              <Link to="/favorites" onClick={() => setIsOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <Heart className="w-4 h-4 text-zinc-400" /> Favorites
              </Link>

              {isInstallable && (
                <button 
                  onClick={() => {
                    setIsOpen(false);
                    installApp();
                  }} 
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                >
                  <Download className="w-4 h-4" /> Install App
                </button>
              )}

              <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1"></div>

              <Link to="/settings" onClick={() => setIsOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <Settings className="w-4 h-4 text-zinc-400" /> Settings
              </Link>
              
              <button 
                onClick={async () => {
                  vibrate(50);
                  // Don't close immediately if we want to show loading, but closing is fine too.
                  // Actually let's close, but maybe show a toast by changing state?
                  // We don't have a toast component imported, let's just use the current closing logic
                  // but maybe wait for resolution before closing so user sees loading state?
                  try {
                    // Start sync with loading UX (button could disable, but simplest is keeping it as is)
                    await Promise.all([
                      checkForUpdates(true),
                      refreshSettings(),
                      refreshProfile(true, 'manual')
                    ]);
                  } finally {
                    setIsOpen(false);
                  }
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Refresh Content & Account Sync"
              >
                <RefreshCw className={clsx("w-4 h-4 text-zinc-400", isSyncing && "animate-spin text-emerald-500")} /> 
                {isSyncing ? "Refreshing..." : "Refresh App Data"}
              </button>

              <button 
                onClick={handleLogout} 
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRequestModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsRequestModalOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden"
            >
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                <h3 className="font-bold text-lg text-zinc-900 dark:text-white">Request Movie</h3>
                <button onClick={() => setIsRequestModalOpen(false)} className="p-1 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4">
                <form onSubmit={handleRequestSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Title</label>
                    <input
                      type="text"
                      className="w-full bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl p-3 text-sm font-medium text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
                      placeholder="e.g. Inception"
                      value={newRequest.title}
                      onChange={e => setNewRequest({...newRequest, title: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Type</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setNewRequest({...newRequest, type: 'movie'})} className={clsx("flex-1 py-2 text-sm font-bold rounded-xl transition-colors", newRequest.type === 'movie' ? "bg-emerald-500 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700")}>Movie</button>
                      <button type="button" onClick={() => setNewRequest({...newRequest, type: 'series'})} className={clsx("flex-1 py-2 text-sm font-bold rounded-xl transition-colors", newRequest.type === 'series' ? "bg-emerald-500 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700")}>Series</button>
                    </div>
                  </div>
                  {newRequest.type === 'movie' && (
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Year</label>
                      <input
                        type="text"
                        className="w-full bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl p-3 text-sm font-medium text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
                        placeholder="e.g. 2010"
                        value={newRequest.year}
                        onChange={e => setNewRequest({...newRequest, year: e.target.value})}
                        required
                      />
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                     <button type="button" onClick={() => setIsRequestModalOpen(false)} className="flex-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold py-3 rounded-xl transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50">Cancel</button>
                     <button type="submit" disabled={submittingRequest || !newRequest.title.trim() || (newRequest.type === 'movie' && !newRequest.year)} className="flex-1 bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors hover:bg-emerald-600 disabled:opacity-50">
                        {submittingRequest ? "Submitting..." : "Submit"}
                     </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
});
