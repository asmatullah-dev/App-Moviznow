import React, { useState, useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface NotificationMenuProps {}

export const NotificationMenu = React.memo(() => {
  const { profile, updateUserProfileData } = useAuth();
  const { notifications, loading } = useNotifications();
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [localLastCheck, setLocalLastCheck] = useState<Date | null>(null);
  const mountTime = useRef(new Date());
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);
  
  // Reset localLastCheck when profile updates
  useEffect(() => {
    return () => {
      setLocalLastCheck(null);
    };
  }, [profile?.lastNotificationCheck]);

  if (!profile) return null;

  const handleOpen = async () => {
    const willOpen = !isOpen;
    setIsOpen(willOpen);
    if (willOpen && profile?.uid) {
      const now = new Date();
      setLocalLastCheck(now);
      // Update lastNotificationCheck when opening the menu
      try {
        await updateUserProfileData({
          lastNotificationCheck: now.toISOString()
        }, undefined, false);
      } catch (error) {
        console.error('Error updating lastNotificationCheck:', error);
      }
    }
  };

  const lastCheck = (localLastCheck && (!profile?.lastNotificationCheck || localLastCheck > new Date(profile.lastNotificationCheck)))
    ? localLastCheck
    : (profile?.lastNotificationCheck ? new Date(profile.lastNotificationCheck) : mountTime.current);

  const unreadCount = isOpen ? 0 : notifications.filter(n => {
    const notifDate = new Date(n.createdAt);
    return notifDate > lastCheck;
  }).length;

  return (
    <div className="relative" ref={menuRef}>
      <motion.button 
        whileTap={{ scale: 0.92 }}
        onClick={handleOpen}
        className="relative p-2 rounded-full text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
        title="Notifications"
      >
        <Bell className="w-5 h-5 transition-transform duration-200" />
        {unreadCount > 0 && (
          <motion.span 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full text-[10px] font-extrabold flex items-center justify-center text-white border-2 border-white dark:border-zinc-950 shadow-sm"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: -4 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: 'top right', willChange: 'transform, opacity' }}
            className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh] z-[100]"
          >
            <div className="p-4 sm:p-5 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/80 dark:bg-zinc-950/80 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Bell className="w-4 h-4" />
                </div>
                <h3 className="font-extrabold text-base text-zinc-900 dark:text-white">{t("Notifications")}</h3>
                {unreadCount > 0 && (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{unreadCount} {t("new")}</span>
                )}
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 custom-scrollbar divide-y divide-zinc-100 dark:divide-zinc-800/40">
              {notifications.length === 0 ? (
                <div className="p-12 text-center text-zinc-500 dark:text-zinc-400">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 opacity-60">
                    <Bell className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-semibold">{t("No notifications yet")}</p>
                </div>
              ) : (
                notifications.map((notification, idx) => {
                  const isNew = new Date(notification.createdAt) > lastCheck;
                  const targetUrl = notification.buttonUrl || (notification.contentId ? `/${notification.type === 'series' ? 'series' : 'movie'}/${notification.contentId}` : null);
                  const actionLabel = notification.buttonLabel || (notification.contentId ? (notification.type === 'series' ? 'View Series' : 'View Movie') : null);

                  const content = (
                    <div className="flex gap-3.5">
                      {notification.posterUrl ? (
                        <img 
                          src={notification.posterUrl} 
                          alt="Poster" 
                          className="w-11 h-15 object-cover rounded-xl shrink-0 border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs group-hover:scale-105 transition-transform duration-200"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-11 h-15 bg-zinc-100 dark:bg-zinc-800 rounded-xl shrink-0 flex items-center justify-center border border-zinc-200/80 dark:border-zinc-800/80 text-zinc-400">
                          <Bell className="w-4 h-4" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <h4 className="text-xs font-bold text-zinc-900 dark:text-white truncate">{notification.title}</h4>
                          {isNew && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-xs shadow-emerald-500/50 animate-pulse" />
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-2 leading-relaxed font-medium">{notification.body}</p>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-zinc-400 font-medium">
                            {(() => {
                              try {
                                if (!notification.createdAt) return '';
                                const d = typeof notification.createdAt === 'object' && (notification.createdAt as any)?.seconds 
                                  ? new Date((notification.createdAt as any).seconds * 1000) 
                                  : new Date(notification.createdAt);
                                if (isNaN(d.getTime())) return '';
                                return formatDistanceToNow(d, { addSuffix: true });
                              } catch (e) {
                                return '';
                              }
                            })()}
                          </span>
                          {actionLabel && (
                            <span className="text-[10px] font-extrabold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md uppercase tracking-wider">
                              {t(actionLabel)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );

                  if (targetUrl) {
                    return (
                      <Link 
                        key={notification.id}
                        to={targetUrl}
                        onClick={() => setIsOpen(false)}
                        className={`group block p-3.5 sm:p-4 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-all duration-150 ${isNew ? 'bg-emerald-500/[0.04]' : ''}`}
                      >
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <div 
                      key={notification.id}
                      className={`group block p-3.5 sm:p-4 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-all duration-150 ${isNew ? 'bg-emerald-500/[0.04]' : ''}`}
                    >
                      {content}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
