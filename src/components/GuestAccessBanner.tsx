import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, LogIn, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { clsx } from 'clsx';

interface GuestAccessBannerProps {
  className?: string;
  variant?: 'floating' | 'inline' | 'compact';
  customTitle?: string;
  customMessage?: string;
}

export const GuestAccessBanner: React.FC<GuestAccessBannerProps> = ({
  className = '',
  variant = 'inline',
  customTitle,
  customMessage
}) => {
  const { user, profile, loading, authLoading } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if dismissed in this session
    const dismissed = sessionStorage.getItem('moviz_guest_banner_dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  // Determine if user is logged in via Firebase Auth state or active profile cache
  const isLoggedIn = Boolean(user || profile?.uid);

  // If auth is still loading, or if the user is logged in, or if dismissed: DO NOT show guest banner
  if (authLoading || loading || isLoggedIn || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('moviz_guest_banner_dismissed', 'true');
  };

  const title = customTitle || t("Browsing as Guest");
  const message = customMessage || t("Sign in or create a free account to unlock high-speed streaming links, request titles, and save your watchlist.");

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
        transition={{ duration: 0.3 }}
        className={clsx(
          "w-full rounded-2xl relative overflow-hidden transition-all duration-300 border shadow-lg",
          "bg-gradient-to-r from-emerald-950/50 via-zinc-900 to-teal-950/50 border-emerald-500/30 text-white shadow-emerald-500/5",
          className
        )}
      >
        {/* Glow ambient background */}
        <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-20 bg-emerald-500" />

        <div className="relative p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 max-w-2xl">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md bg-gradient-to-tr from-emerald-500 to-teal-400 text-black shadow-emerald-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-sm sm:text-base text-white tracking-tight flex items-center gap-2">
                  {title}
                </h4>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  {t("Guest View")}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-300 dark:text-zinc-300 font-normal leading-relaxed">
                {message}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0 pt-1 md:pt-0">
            <Link
              to="/login"
              state={{ from: location }}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-extrabold text-xs sm:text-sm shadow-md shadow-emerald-500/25 active:scale-95 transition-all text-center"
            >
              <LogIn className="w-4 h-4" />
              <span>{t("Login / Register")}</span>
            </Link>

            <Link
              to="/membership"
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 hover:text-white font-bold text-xs sm:text-sm border border-white/10 transition-all text-center active:scale-95"
            >
              {t("View Plans")}
            </Link>

            <button
              type="button"
              onClick={handleDismiss}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              title={t("Dismiss")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
