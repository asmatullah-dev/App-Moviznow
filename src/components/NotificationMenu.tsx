import React, { useState, useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { AppNotification } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { motion, AnimatePresence } from 'motion/react';

interface NotificationMenuProps {}

export const NotificationMenu = React.memo(() => {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [localLastCheck, setLocalLastCheck] = useState<Date | null>(null);
  const mountTime = useRef(new Date());
  const menuRef = useRef<HTMLDivElement>(null);

  useModalBehavior(isOpen, () => setIsOpen(false));
  
  // Reset localLastCheck when profile updates
  useEffect(() => {
    setLocalLastCheck(null);
  }, [profile?.lastNotificationCheck]);

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppNotification))
        .filter(n => !n.targetUserId && (!n.targetUserIds || n.targetUserIds.length === 0) || (n.targetUserId === profile.uid) || (n.targetUserIds?.includes(profile.uid)));
      setNotifications(notifs);
    });

    return () => unsubscribe();
  }, [profile]);

  const handleOpen = async () => {
    const willOpen = !isOpen;
    setIsOpen(willOpen);
    if (willOpen && profile?.uid) {
      const now = new Date();
      setLocalLastCheck(now);
      // Update lastNotificationCheck when opening the menu
      try {
        const userRef = doc(db, 'users', profile.uid);
        await updateDoc(userRef, {
          lastNotificationCheck: now.toISOString()
        });
      } catch (error) {
        console.error('Error updating lastNotificationCheck:', error);
      }
    }
  };

  if (!profile) return null;

  const lastCheck = (localLastCheck && (!profile.lastNotificationCheck || localLastCheck > new Date(profile.lastNotificationCheck)))
    ? localLastCheck
    : (profile.lastNotificationCheck ? new Date(profile.lastNotificationCheck) : mountTime.current);

  const unreadCount = isOpen ? 0 : notifications.filter(n => {
    const notifDate = new Date(n.createdAt);
    return notifDate > lastCheck;
  }).length;

  return (
    <>
      <button 
        onClick={handleOpen}
        className="relative p-2 rounded-full text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white border-2 border-white dark:border-zinc-950">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div 
              ref={menuRef}
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ willChange: 'transform, opacity' }}
              className="w-full max-w-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-950 shrink-0">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-zinc-900 dark:text-white">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">{unreadCount} new</span>
                  )}
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="overflow-y-auto flex-1">
                {notifications.length === 0 ? (
                  <div className="p-12 text-center text-zinc-500">
                    <Bell className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-lg">No notifications yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
                    {notifications.map(notification => {
                      const isNew = new Date(notification.createdAt) > lastCheck;
                      const targetUrl = notification.buttonUrl || (notification.contentId ? `/movie/${notification.contentId}` : null);
                      const actionLabel = notification.buttonLabel || (notification.contentId ? (notification.type === 'series' ? 'View Series' : 'View Movie') : null);
  
                      const content = (
                        <div className="flex gap-4">
                          {notification.posterUrl ? (
                            <img 
                              src={notification.posterUrl} 
                              alt="Poster" 
                              className="w-12 h-16 object-cover rounded-md shrink-0 border border-zinc-200 dark:border-zinc-800"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-12 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-md shrink-0 flex items-center justify-center">
                              <Bell className="w-5 h-5 text-zinc-600" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white mb-1 leading-tight">{notification.title}</h4>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-2">{notification.body}</p>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-zinc-500 font-medium">
                                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                              </span>
                              {actionLabel && (
                                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                                  {actionLabel}
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
                            className={`block p-4 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors ${isNew ? 'bg-emerald-500/5' : ''}`}
                          >
                            {content}
                          </Link>
                        );
                      }
  
                      return (
                        <div 
                          key={notification.id}
                          className={`block p-4 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors ${isNew ? 'bg-emerald-500/5' : ''}`}
                        >
                          {content}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});
