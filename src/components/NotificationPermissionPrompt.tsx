import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, CheckCircle2, Sparkles, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { requestNotificationPermission, db, runWithNetwork, checkIsBrowserFcmCapable, isFcmSupported } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { safeStorage } from '../utils/safeStorage';
import { doc, setDoc } from 'firebase/firestore';

export const NotificationPermissionPrompt: React.FC = () => {
  const { user, profile } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isGranted, setIsGranted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDenied, setIsDenied] = useState(false);

  const evaluatePromptEligibility = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;

    // RULE: "Don't ask if browser doesn't support fcm"
    if (!checkIsBrowserFcmCapable()) return false;

    // 1. Check if user or device is already registered with FCM
    const localToken = safeStorage.getItem('active_fcm_token') ||
      (typeof window !== 'undefined' ? window.localStorage?.getItem('active_fcm_token') : null) ||
      safeStorage.getItem('guest_fcm_token') ||
      safeStorage.getItem(`fcm_token_v4_last_update_${user?.uid || 'guest'}`) ||
      safeStorage.getItem(`fcm_auto_registered_${user?.uid || 'guest'}`);

    const profileToken = profile?.fcmToken || (profile as any)?.fcm_token;
    const isFcmRegistered = Boolean(localToken || profileToken);

    // 2. Check if notification is disabled by user in Settings
    const isFcmDisabledInSettings = Boolean(
      profile?.notification === 'no' ||
      profile?.isFcmDisabled === true ||
      profile?.notificationPreferences?.fcm?.enabled === false
    );

    // REQUIREMENT: "don't remind if disable by settings but registered with fcm"
    if (isFcmRegistered && isFcmDisabledInSettings) {
      return false;
    }

    // If already registered with FCM and browser notification permission is granted, no prompt needed
    if (isFcmRegistered && Notification.permission === 'granted') {
      return false;
    }

    // REQUIREMENT: "Remind every time to user to enable notification if already not registered with fcm"
    // Short-term snooze check (5 minutes after user clicks "Maybe Later" so it doesn't interrupt continuous video play or page transitions within same 5 mins)
    const snoozedUntilStr = safeStorage.getItem('notif_prompt_snoozed_until');
    if (snoozedUntilStr) {
      const snoozedUntil = parseInt(snoozedUntilStr, 10);
      if (!isNaN(snoozedUntil) && Date.now() < snoozedUntil) {
        return false;
      }
    }

    return true;
  }, [user?.uid, profile?.fcmToken, profile?.notification, profile?.isFcmDisabled, profile?.notificationPreferences]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // RULE: "Don't ask if browser doesn't support fcm"
    if (!checkIsBrowserFcmCapable()) {
      setIsVisible(false);
      return;
    }

    let isMounted = true;
    let timer: any = null;

    isFcmSupported().then(supported => {
      if (!isMounted) return;
      if (!supported) {
        setIsVisible(false);
        return;
      }

      const shouldRemind = evaluatePromptEligibility();
      if (!shouldRemind) {
        setIsVisible(false);
        return;
      }

      // If browser permission is already granted but FCM token not yet synced locally or to user profile:
      if (Notification.permission === 'granted') {
        const hasRegistered = safeStorage.getItem(`fcm_auto_registered_${user?.uid || 'guest'}`);
        const existingToken = safeStorage.getItem('active_fcm_token') || profile?.fcmToken;
        if (existingToken) {
          safeStorage.setItem(`fcm_auto_registered_${user?.uid || 'guest'}`, 'true');
          return;
        }

        if (!hasRegistered && typeof navigator !== 'undefined' && navigator.onLine) {
          // Defer background FCM token sync until after initial render settles (7.5s) if online
          timer = setTimeout(() => {
            if (!isMounted || !navigator.onLine) return;
            requestNotificationPermission().then(token => {
              if (token) {
                safeStorage.setItem(`fcm_auto_registered_${user?.uid || 'guest'}`, 'true');
                if (user?.uid) {
                  const userRef = doc(db, 'users', user.uid);
                  runWithNetwork(() => setDoc(userRef, {
                    fcmToken: token,
                    fcmTokenUpdatedAt: new Date().toISOString(),
                    notification: 'yes',
                    isFcmDisabled: false
                  }, { merge: true })).catch(() => {});
                }
              }
            }).catch(() => {});
          }, 7500);
        }
        return;
      }

      setIsDenied(Notification.permission === 'denied');

      // Trigger floating reminder prompt after 7.5 seconds when user has settled on page
      timer = setTimeout(() => {
        if (isMounted) {
          setIsVisible(true);
        }
      }, 7500);
    });

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [evaluatePromptEligibility, user?.uid]);

  const handleAllow = async () => {
    setLoading(true);
    try {
      const token = await requestNotificationPermission(false);
      if (token) {
        setIsGranted(true);
        safeStorage.setItem(`fcm_auto_registered_${user?.uid || 'guest'}`, 'true');
        safeStorage.removeItem('notif_prompt_snoozed_until');

        // Ensure user document in Firestore is directly updated with fcmToken and notification: yes
        if (user?.uid) {
          try {
            const userRef = doc(db, 'users', user.uid);
            await runWithNetwork(() => setDoc(userRef, {
              fcmToken: token,
              fcmTokenUpdatedAt: new Date().toISOString(),
              notification: 'yes',
              isFcmDisabled: false,
              notificationPreferences: {
                fcm: {
                  enabled: true,
                  newContent: true,
                  membershipAlerts: true,
                  membershipExpiry: true,
                  orders: true
                }
              }
            }, { merge: true })).catch(() => {});
          } catch (docErr) {
            console.warn("Could not write FCM token to user document:", docErr);
          }
        }

        setTimeout(() => {
          setIsVisible(false);
        }, 2500);
      } else if (Notification.permission === 'granted') {
        const retryToken = await requestNotificationPermission(true);
        if (retryToken) {
          setIsGranted(true);
          safeStorage.setItem(`fcm_auto_registered_${user?.uid || 'guest'}`, 'true');
          safeStorage.removeItem('notif_prompt_snoozed_until');

          if (user?.uid) {
            const userRef = doc(db, 'users', user.uid);
            runWithNetwork(() => setDoc(userRef, {
              fcmToken: retryToken,
              fcmTokenUpdatedAt: new Date().toISOString(),
              notification: 'yes',
              isFcmDisabled: false
            }, { merge: true })).catch(() => {});
          }

          setTimeout(() => {
            setIsVisible(false);
          }, 2500);
        } else {
          setIsVisible(false);
        }
      } else if (Notification.permission === 'denied') {
        setIsDenied(true);
      } else {
        setIsVisible(false);
      }
    } catch (err) {
      console.warn("Failed to request notification permission:", err);
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setIsDenied(true);
      } else {
        setIsVisible(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    // Snooze for 5 minutes so it doesn't disturb immediately, but reminds user again on next session or after 5 mins
    safeStorage.setItem('notif_prompt_snoozed_until', (Date.now() + 5 * 60 * 1000).toString());
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
                {user ? "Your device is registered for personalized movie & series alerts." : "Device registered! You'll receive instant updates."}
              </p>
            </div>
          </div>
        ) : isDenied ? (
          <div>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-sm text-zinc-900 dark:text-white leading-tight">
                    Notifications Blocked
                  </h4>
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                    Browser Setting Required
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
              Browser permissions are currently blocked. Click the lock/settings icon 🔒 in your browser's address bar, change <strong>Notifications</strong> to <strong>Allow</strong>, then tap below.
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAllow}
                disabled={loading}
                className="flex-1 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Retry Activation"}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="px-3 py-2.5 text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              >
                Dismiss
              </button>
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
                    {user ? "Device Alert Registration" : "Guest Device Alert"}
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
              Never miss new movies, series episodes, or fresh download links! Enable notifications to receive instant updates.
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
