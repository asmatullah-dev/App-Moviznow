import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogIn,
  Sparkles,
  X,
  ArrowRight,
  Crown,
  ChevronRight,
  UserPlus,
  Play,
  Download,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  modalBackdropAnimation,
  modalContainerAnimation,
  modalGpuStyle,
} from '../utils/modalAnimations';

export const LoginReminderBanner: React.FC = () => {
  const { profile, loading, authLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [isDismissed, setIsDismissed] = useState(false);
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  // Check if user dismissed banner for this session
  useEffect(() => {
    const dismissedSession = sessionStorage.getItem('login_reminder_dismissed');
    if (dismissedSession === 'true') {
      setIsDismissed(true);
    }
  }, []);

  // Timed popup after 5000ms - 8000ms on app mount (using 6000ms) - shows every time app opens
  useEffect(() => {
    // Wait until authentication status is definitively resolved (never trigger for logged in users)
    if (loading || authLoading) return;
    if (profile && profile.uid) return;

    const timer = setTimeout(() => {
      const currentPath = window.location.pathname;
      const excluded =
        currentPath.startsWith('/admin') ||
        currentPath === '/login' ||
        currentPath === '/maintenance' ||
        currentPath === '/install' ||
        currentPath === '/app' ||
        currentPath === '/unsubscribe';

      if (!excluded && !profile?.uid) {
        setIsPopupOpen(true);
      }
    }, 6000);

    return () => clearTimeout(timer);
  }, [profile, loading, authLoading]);

  // Do not show on pages where login is inappropriate or redundant
  const pathname = location.pathname;
  if (
    pathname.startsWith('/admin') ||
    pathname === '/login' ||
    pathname === '/maintenance' ||
    pathname === '/install' ||
    pathname === '/app' ||
    pathname === '/unsubscribe'
  ) {
    return null;
  }

  // CRITICAL: Do NOT show anything while auth is loading!
  // Prevents the milliseconds flicker above the header for logged in users
  if (loading || authLoading) {
    return null;
  }

  // Only show when user is NOT logged in
  if (profile && profile.uid) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('login_reminder_dismissed', 'true');
  };

  const handleReopen = () => {
    setIsDismissed(false);
    sessionStorage.removeItem('login_reminder_dismissed');
  };

  const handleClosePopup = () => {
    setIsPopupOpen(false);
  };

  const handleGoToLogin = () => {
    setIsPopupOpen(false);
    navigate('/login', {
      state: { from: location.pathname + location.search },
    });
  };

  return (
    <>
      {/* 1. TOP BANNER OR FLOATING PILL */}
      {isDismissed ? (
        <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[999]">
          <button
            onClick={handleGoToLogin}
            className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-blue-600/30 ring-2 ring-blue-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <LogIn className="w-4 h-4 text-white animate-pulse" />
            <span>{t('Sign In')}</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="relative z-30 w-full bg-gradient-to-b from-blue-950/90 via-zinc-950 to-zinc-950 border-b border-blue-500/30 text-white shadow-2xl overflow-hidden backdrop-blur-md"
          >
            {/* Ambient Top Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-gradient-to-r from-blue-500/20 via-indigo-500/15 to-emerald-500/15 blur-3xl pointer-events-none" />

            <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
                {/* Left Column: Icon & Copy */}
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-400 shrink-0 shadow-lg shadow-blue-500/20 mt-0.5 sm:mt-0">
                    <LogIn className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-md border bg-blue-500/20 border-blue-400/40 text-blue-300">
                        {t('Sign In Required')}
                      </span>
                      <span className="text-xs text-zinc-400 hidden sm:inline">•</span>
                      <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                        {t('Sign in to unlock streaming, downloads & favorites')}
                      </h3>
                    </div>
                    <p className="text-xs text-zinc-300 sm:text-zinc-400 leading-relaxed max-w-2xl">
                      {t(
                        'Log in or create a free account to watch movies, save watch later, sync progress, and activate membership passes from just Rs 100/mo.'
                      )}
                    </p>
                  </div>
                </div>

                {/* Right Column: CTA Buttons & Dismiss */}
                <div className="flex items-center gap-2 self-end md:self-center shrink-0 w-full md:w-auto justify-between md:justify-end pt-1 md:pt-0 border-t border-zinc-800/80 md:border-none">
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <button
                      type="button"
                      onClick={() => navigate('/membership')}
                      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 hover:text-white transition-colors"
                    >
                      <Crown className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('View Plans')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleGoToLogin}
                      className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/25 ring-1 ring-blue-400/50 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>{t('Log In / Sign Up')}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="p-1.5 sm:p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors ml-1 cursor-pointer"
                    title={t('Close')}
                    aria-label={t('Close')}
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* 2. TIMED POP-UP MODAL WITH STANDARD MODAL ANIMATION */}
      <AnimatePresence>
        {isPopupOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
            {/* Default Backdrop Animation */}
            <motion.div
              {...modalBackdropAnimation}
              onClick={handleClosePopup}
              className="fixed inset-0 bg-black/85 backdrop-blur-md"
            />
            {/* Default Modal Container Animation */}
            <motion.div
              {...modalContainerAnimation}
              style={modalGpuStyle}
              className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden z-10 p-5 sm:p-7 flex flex-col items-center text-center my-auto"
            >
              {/* Ambient Header Glow */}
              <div className="absolute top-0 inset-x-0 h-28 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 blur-3xl opacity-40 pointer-events-none" />

              <button
                onClick={handleClosePopup}
                type="button"
                className="absolute top-4 right-4 p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800/80 transition-colors z-20 cursor-pointer"
                aria-label={t('Close')}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-xl shadow-blue-500/10 mb-3">
                <LogIn className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-bold uppercase tracking-wider mb-2">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>{t('Sign In Reminder')}</span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-2">
                {t('Sign in to unlock streaming, downloads & favorites')}
              </h2>

              <p className="text-xs sm:text-sm text-zinc-400 max-w-sm mb-5 leading-relaxed">
                {t(
                  'Log in or create a free account to watch movies, save watch later, sync progress, and activate membership passes from just Rs 100/mo.'
                )}
              </p>

              {/* Perks Grid */}
              <div className="grid grid-cols-2 gap-2 w-full mb-6 text-left">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                  <Play className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs text-zinc-200 font-semibold">{t('Unlimited Streaming')}</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                  <Download className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-xs text-zinc-200 font-semibold">{t('Fast Downloads')}</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                  <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs text-zinc-200 font-semibold">{t('VIP & Basic Passes')}</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                  <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="text-xs text-zinc-200 font-semibold">{t('Sync Across Devices')}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full">
                <button
                  type="button"
                  onClick={handleGoToLogin}
                  className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm shadow-xl shadow-blue-600/30 ring-2 ring-blue-400/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{t('Log In / Sign Up')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleClosePopup();
                    navigate('/membership');
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 py-3 px-5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-semibold text-xs sm:text-sm border border-zinc-800 transition-colors"
                >
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>{t('Plans')}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleClosePopup}
                className="mt-4 text-xs text-zinc-500 hover:text-zinc-400 transition-colors cursor-pointer"
              >
                {t('Continue Browsing as Guest')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
