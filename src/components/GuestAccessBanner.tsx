import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, LogIn, Crown, X, Lock, Play } from 'lucide-react';
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
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [isDismissed, setIsDismissed] = useState(false);

  // If already logged in and active user (not pending), don't show
  const isGuestOrPending = !user || !profile || profile.status === 'pending';

  useEffect(() => {
    // Check if dismissed in this session
    const dismissed = sessionStorage.getItem('moviz_guest_banner_dismissed');
    if (dismissed === 'true' && variant === 'floating') {
      setIsDismissed(true);
    }
  }, [variant]);

  if (!isGuestOrPending || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    if (variant === 'floating') {
      sessionStorage.setItem('moviz_guest_banner_dismissed', 'true');
    }
  };

  const title = customTitle || (!user ? t("Browsing as Guest") : t("Pending Account Access"));
  const message = customMessage || (!user 
    ? t("Sign in or create a free account to unlock high-speed streaming links, request titles, and save your watchlist.")
    : t("Your account status is pending activation. Upgrade to VIP or contact support for full unrestricted access.")
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
        transition={{ duration: 0.3 }}
        className={clsx(
          "w-full rounded-2xl relative overflow-hidden transition-all duration-300 border shadow-lg",
          !user
            ? "bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-teal-950/40 border-emerald-500/30 text-white shadow-emerald-500/5"
            : "bg-gradient-to-r from-amber-950/40 via-zinc-900 to-yellow-950/40 border-amber-500/30 text-white shadow-amber-500/5",
          className
        )}
      >
        {/* Glow ambient background */}
        <div className={clsx(
          "absolute -right-12 -top-12 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-20",
          !user ? "bg-emerald-500" : "bg-amber-500"
        )} />

        <div className="relative p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 max-w-2xl">
            <div className={clsx(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md",
              !user 
                ? "bg-gradient-to-tr from-emerald-500 to-teal-400 text-black shadow-emerald-500/30"
                : "bg-gradient-to-tr from-amber-500 to-yellow-400 text-black shadow-amber-500/30"
            )}>
              {!user ? <Sparkles className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-sm sm:text-base text-white tracking-tight flex items-center gap-2">
                  {title}
                </h4>
                <span className={clsx(
                  "text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider border",
                  !user
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                )}>
                  {!user ? t("Guest View") : t("Pending")}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-300 dark:text-zinc-300 font-normal leading-relaxed">
                {message}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0 pt-1 md:pt-0">
            {!user ? (
              <Link
                to="/login"
                state={{ from: location }}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-extrabold text-xs sm:text-sm shadow-md shadow-emerald-500/25 active:scale-95 transition-all text-center"
              >
                <LogIn className="w-4 h-4" />
                <span>{t("Login / Register")}</span>
              </Link>
            ) : (
              <Link
                to="/membership"
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-extrabold text-xs sm:text-sm shadow-md shadow-amber-500/25 active:scale-95 transition-all text-center"
              >
                <Crown className="w-4 h-4" />
                <span>{t("Upgrade to VIP")}</span>
              </Link>
            )}

            <Link
              to="/membership"
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 hover:text-white font-bold text-xs sm:text-sm border border-white/10 transition-all text-center active:scale-95"
            >
              {t("View Plans")}
            </Link>

            {variant === 'floating' && (
              <button
                type="button"
                onClick={handleDismiss}
                className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                title={t("Dismiss")}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
