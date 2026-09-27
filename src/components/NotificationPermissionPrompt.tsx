import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, CheckCircle2, Sparkles, ShieldCheck } from 'lucide-react';
import { requestNotificationPermission } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { safeStorage } from '../utils/safeStorage';

export const NotificationPermissionPrompt: React.FC = () => {
  const { user } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isGranted, setIsGranted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    // Check current permission state
    if (Notification.permission === 'granted') {
      // Silently ensure token is registered
      const hasRegistered = safeStorage.getItem(`fcm_auto_registered_${user?.uid || 'guest'}`);
      if (!hasRegistered) {
        requestNotificationPermission().then(token => {
          if (token) {
            safeStorage.setItem(`fcm_auto_registered_${user?.uid || 'guest'}`, 'true');
          }
        }).catch(() => {});
      }
      return;
    }

    if (Notification.permission === 'denied') return;

    // Check if user dismissed prompt in this session
    const isDismissed = sessionStorage.getItem('notif_prompt_dismissed') === 'true';
    if (isDismissed) return;

    // Trigger floating prompt after 2.5 seconds
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [user?.uid]);

  const handleAllow = async () => {
    setLoading(true);
    try {
      const token = await requestNotificationPermission(true);
      if (token || Notification.permission === 'granted') {
        setIsGranted(true);
        safeStorage.setItem(`fcm_auto_registered_${user?.uid || 'guest'}`, 'true');
        setTimeout(() => {
          setIsVisible(false);
        }, 3000);
      } else {
        setIsVisible(false);
      }
    } catch (err) {
      console.warn("Failed to request notification permission:", err);
      setIsVisible(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('notif_prompt_dismissed', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed bottom-5 right-4 left-4 sm:left-auto sm:right-6 sm:max-w-sm z-[9990] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl rounded-2xl p-4 sm:p-5 select-none"
      >
        {isGranted ? (
          <div className="flex items-center gap-3 py-1">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-500 shrink-0">
              <CheckCircle2 className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white flex items-center gap-1.5">
                Notifications Enabled! <Sparkles className="w-4 h-4 text-amber-400" />
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {user ? "You'll receive personalized alerts directly on your device." : "Guest device registered! You'll receive latest updates."}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5">
                <div className="relative p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0">
                  <Bell className="w-5 h-5 animate-pulse" />
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full animate-ping" />
                </div>
                <div>
                  <h4 className="font-black text-sm text-zinc-900 dark:text-white leading-tight">
                    Enable Push Notifications 🔔
                  </h4>
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    {user ? "User Device Alert" : "Guest Device Alert"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-300 mb-4 leading-relaxed">
              Get instant alerts when new movies, series episodes, or fresh download links are added!
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAllow}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? "Activating..." : "Allow Notifications"}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="px-3 py-2.5 text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              >
                Maybe Later
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
