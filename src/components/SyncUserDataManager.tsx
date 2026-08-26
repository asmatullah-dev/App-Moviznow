import { useEffect, useCallback, useRef } from 'react';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, runWithNetwork } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { safeStorage } from '../utils/safeStorage';
import { UserProfile } from '../types';

export function getToday7AMDateString(): string {
  const now = new Date();
  const currentHour = now.getHours();

  // If before 7 AM, the last 7 AM window was yesterday
  if (currentHour < 7) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return `${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}_7am`;
  }
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}_7am`;
}

export async function executeSyncUserData(currentUserUid: string, currentProfile: UserProfile | null, reason: string = 'manual'): Promise<boolean> {
  if (!currentUserUid) return false;

  const nowTime = Date.now();
  const userRef = doc(db, 'users', currentUserUid);

  // 1. Flush accumulated time
  const timeCacheKey = `accumulated_time_seconds_${currentUserUid}`;
  const accSecs = parseInt(safeStorage.getItem(timeCacheKey) || '0', 10);
  if (accSecs > 0) {
    safeStorage.setItem(timeCacheKey, '0');
    const pendingStr = safeStorage.getItem('pending_user_updates') || '{}';
    try {
      const pendingAll = JSON.parse(pendingStr);
      pendingAll[currentUserUid] = pendingAll[currentUserUid] || {};
      const currentBase = typeof pendingAll[currentUserUid].timeSpent === 'number'
        ? pendingAll[currentUserUid].timeSpent
        : (currentProfile?.timeSpent || 0);
      pendingAll[currentUserUid].timeSpent = currentBase + accSecs;
      safeStorage.setItem('pending_user_updates', JSON.stringify(pendingAll));
    } catch (e) {}
  }

  // Capture starting state of all pending queues
  const startFavsStr = safeStorage.getItem('pending_favorites_array');
  const startWLStr = safeStorage.getItem('pending_watch_later_array');
  const startOrdersStr = safeStorage.getItem('pending_orders_array');
  const startReviewsStr = safeStorage.getItem('pending_reviews_array');
  const startReportedStr = safeStorage.getItem('pending_reported_links');
  const startRequestsStr = safeStorage.getItem('pending_movie_requests');

  const startUserUpdatesStr = safeStorage.getItem('pending_user_updates');
  let startUserUpdates: any = null;
  if (startUserUpdatesStr) {
    try {
      const parsedAll = JSON.parse(startUserUpdatesStr);
      startUserUpdates = parsedAll[currentUserUid] || null;
    } catch (e) {}
  }

  const hasPending = !!(
    startFavsStr ||
    startWLStr ||
    startOrdersStr ||
    startReviewsStr ||
    startReportedStr ||
    startRequestsStr ||
    startUserUpdates ||
    safeStorage.getItem('needs_user_sync') === 'true'
  );

  if (!hasPending) {
    // If there is absolutely no pending data to sync, exit immediately with zero Firestore writes and zero reads.
    return true;
  }

  // 2. Prepare updatesToPush from starting states
  const updatesToPush: Record<string, any> = {};

  // Pending Favorites & Watch Later
  if (startFavsStr) {
    try { updatesToPush.favorites = JSON.parse(startFavsStr); } catch (e) {}
  }
  if (startWLStr) {
    try { updatesToPush.watchLater = JSON.parse(startWLStr); } catch (e) {}
  }

  // Pending Orders
  if (startOrdersStr) {
    try {
      const pendingOrders = JSON.parse(startOrdersStr);
      if (Array.isArray(pendingOrders) && pendingOrders.length > 0) {
        const existingOrders = currentProfile?.orders || [];
        const orderMap = new Map();
        existingOrders.forEach((o: any) => o && o.id && orderMap.set(o.id, o));
        pendingOrders.forEach((o: any) => o && o.id && orderMap.set(o.id, o));
        updatesToPush.orders = Array.from(orderMap.values());
      }
    } catch (e) {}
  }

  // Pending Reviews
  if (startReviewsStr) {
    try {
      const pendingReviews = JSON.parse(startReviewsStr);
      if (Array.isArray(pendingReviews) && pendingReviews.length > 0) {
        updatesToPush.pendingReviews = pendingReviews;
      }
    } catch (e) {}
  }

  // Pending Reported Links
  if (startReportedStr) {
    try {
      const pendingReported = JSON.parse(startReportedStr);
      if (Array.isArray(pendingReported) && pendingReported.length > 0) {
        updatesToPush.reported_links = pendingReported;
      }
    } catch (e) {}
  }

  // Pending Movie Requests
  if (startRequestsStr) {
    try {
      const pendingReqs = JSON.parse(startRequestsStr);
      if (Array.isArray(pendingReqs) && pendingReqs.length > 0) {
        updatesToPush.movieRequests = pendingReqs;
      }
    } catch (e) {}
  }

  // Generic Pending User Updates (e.g. settings, language, theme)
  if (startUserUpdates) {
    Object.assign(updatesToPush, startUserUpdates);
  }

  // Include preferredTheme / preferredLanguage if updated in localStorage
  const currentTheme = safeStorage.getItem('theme_preference');
  if (currentTheme) updatesToPush.preferredTheme = currentTheme;

  const currentLang = safeStorage.getItem('language_preference');
  if (currentLang) updatesToPush.preferredLanguage = currentLang;

  updatesToPush.updatedAt = serverTimestamp();

  if (!navigator.onLine) {
    safeStorage.setItem('needs_user_sync', 'true');
    return false;
  }

  try {
    const { setDoc } = await import('firebase/firestore');
    
    // Write directly to user document with merge - 0 pre-reads required
    await runWithNetwork(() => setDoc(userRef, updatesToPush, { merge: true }));

    // --- CLEANUP IN LOCAL QUEUES ONLY AFTER CONFIRMED SUCCESS ---
    safeStorage.removeItem('needs_user_sync');

    // 1. Favorites Cleanup
    const currentFavsStr = safeStorage.getItem('pending_favorites_array');
    if (currentFavsStr === startFavsStr) {
      safeStorage.removeItem('pending_favorites_array');
    } else if (currentFavsStr && startFavsStr) {
      try {
        const currentFavs = JSON.parse(currentFavsStr);
        const startFavs = JSON.parse(startFavsStr);
        const remainingFavs = currentFavs.filter((id: string) => !startFavs.includes(id));
        if (remainingFavs.length > 0) {
          safeStorage.setItem('pending_favorites_array', JSON.stringify(remainingFavs));
        } else {
          safeStorage.removeItem('pending_favorites_array');
        }
      } catch (e) {
        safeStorage.removeItem('pending_favorites_array');
      }
    }

    // 2. Watch Later Cleanup
    const currentWLStr = safeStorage.getItem('pending_watch_later_array');
    if (currentWLStr === startWLStr) {
      safeStorage.removeItem('pending_watch_later_array');
    } else if (currentWLStr && startWLStr) {
      try {
        const currentWL = JSON.parse(currentWLStr);
        const startWL = JSON.parse(startWLStr);
        const remainingWL = currentWL.filter((id: string) => !startWL.includes(id));
        if (remainingWL.length > 0) {
          safeStorage.setItem('pending_watch_later_array', JSON.stringify(remainingWL));
        } else {
          safeStorage.removeItem('pending_watch_later_array');
        }
      } catch (e) {
        safeStorage.removeItem('pending_watch_later_array');
      }
    }

    // 3. Orders Cleanup
    const currentOrdersStr = safeStorage.getItem('pending_orders_array');
    if (currentOrdersStr === startOrdersStr) {
      safeStorage.removeItem('pending_orders_array');
    } else if (currentOrdersStr && startOrdersStr) {
      try {
        const currentOrders = JSON.parse(currentOrdersStr);
        const startOrders = JSON.parse(startOrdersStr);
        const startOrderIds = new Set(startOrders.map((o: any) => o?.id).filter(Boolean));
        const remainingOrders = currentOrders.filter((o: any) => !o || !o.id || !startOrderIds.has(o.id));
        if (remainingOrders.length > 0) {
          safeStorage.setItem('pending_orders_array', JSON.stringify(remainingOrders));
        } else {
          safeStorage.removeItem('pending_orders_array');
        }
      } catch (e) {
        safeStorage.removeItem('pending_orders_array');
      }
    }

    // 4. Reviews Cleanup
    const currentReviewsStr = safeStorage.getItem('pending_reviews_array');
    if (currentReviewsStr === startReviewsStr) {
      safeStorage.removeItem('pending_reviews_array');
    } else if (currentReviewsStr && startReviewsStr) {
      try {
        const currentReviews = JSON.parse(currentReviewsStr);
        const startReviews = JSON.parse(startReviewsStr);
        const startReviewKeys = new Set(startReviews.map((r: any) => r?.id || JSON.stringify(r)).filter(Boolean));
        const remainingReviews = currentReviews.filter((r: any) => !startReviewKeys.has(r?.id || JSON.stringify(r)));
        if (remainingReviews.length > 0) {
          safeStorage.setItem('pending_reviews_array', JSON.stringify(remainingReviews));
        } else {
          safeStorage.removeItem('pending_reviews_array');
        }
      } catch (e) {
        safeStorage.removeItem('pending_reviews_array');
      }
    }

    // 5. Reported Links Cleanup
    const currentReportedStr = safeStorage.getItem('pending_reported_links');
    if (currentReportedStr === startReportedStr) {
      safeStorage.removeItem('pending_reported_links');
    } else if (currentReportedStr && startReportedStr) {
      try {
        const currentReported = JSON.parse(currentReportedStr);
        const startReported = JSON.parse(startReportedStr);
        const startKeys = new Set(startReported.map((item: any) => item?.id || JSON.stringify(item)).filter(Boolean));
        const remaining = currentReported.filter((item: any) => !startKeys.has(item?.id || JSON.stringify(item)));
        if (remaining.length > 0) {
          safeStorage.setItem('pending_reported_links', JSON.stringify(remaining));
        } else {
          safeStorage.removeItem('pending_reported_links');
        }
      } catch (e) {
        safeStorage.removeItem('pending_reported_links');
      }
    }

    // 6. Movie Requests Cleanup
    const currentRequestsStr = safeStorage.getItem('pending_movie_requests');
    if (currentRequestsStr === startRequestsStr) {
      safeStorage.removeItem('pending_movie_requests');
    } else if (currentRequestsStr && startRequestsStr) {
      try {
        const currentRequests = JSON.parse(currentRequestsStr);
        const startRequests = JSON.parse(startRequestsStr);
        const startKeys = new Set(startRequests.map((item: any) => item?.id || JSON.stringify(item)).filter(Boolean));
        const remaining = currentRequests.filter((item: any) => !startKeys.has(item?.id || JSON.stringify(item)));
        if (remaining.length > 0) {
          safeStorage.setItem('pending_movie_requests', JSON.stringify(remaining));
        } else {
          safeStorage.removeItem('pending_movie_requests');
        }
      } catch (e) {
        safeStorage.removeItem('pending_movie_requests');
      }
    }

    // 7. Generic Pending User Updates Cleanup
    const currentUserUpdatesStr = safeStorage.getItem('pending_user_updates');
    if (currentUserUpdatesStr && startUserUpdates) {
      try {
        const currentAll = JSON.parse(currentUserUpdatesStr);
        const myCurrentPending = currentAll[currentUserUid];
        if (myCurrentPending) {
          const keysCommitted = Object.keys(startUserUpdates);
          keysCommitted.forEach((key) => {
            if (JSON.stringify(myCurrentPending[key]) === JSON.stringify(startUserUpdates[key])) {
              delete myCurrentPending[key];
            }
          });
          if (Object.keys(myCurrentPending).length === 0) {
            delete currentAll[currentUserUid];
          } else {
            currentAll[currentUserUid] = myCurrentPending;
          }
        }
        if (Object.keys(currentAll).length === 0) {
          safeStorage.removeItem('pending_user_updates');
        } else {
          safeStorage.setItem('pending_user_updates', JSON.stringify(currentAll));
        }
      } catch (e) {}
    }

    // Update local cached profile version
    safeStorage.setItem(`profile_version_${currentUserUid}`, nowTime.toString());

    // Update profile cache
    if (currentProfile) {
      const updatedProfile = { ...currentProfile, ...updatesToPush };
      safeStorage.setItem('profile_cache', JSON.stringify(updatedProfile));
    }

    console.log(`Sync completed successfully. Reason: ${reason}`);

    return true;
  } catch (err: any) {
    console.error('Failed to sync user data to Firestore:', err);
    if (err && (err.code === 'permission-denied' || err.message?.includes('permission') || err.message?.includes('not-found'))) {
      console.warn("Permission denied or user document missing. Clearing local queues and signing out.");
      safeStorage.removeItem('needs_user_sync');
      safeStorage.removeItem('profile_cache');
      const { signOut } = await import('firebase/auth');
      const { auth } = await import('../firebase');
      await signOut(auth).catch(() => {});
    } else {
      safeStorage.setItem('needs_user_sync', 'true');
    }
    return false;
  }
}

export function SyncUserDataManager() {
  const { user, profile, refreshProfile } = useAuth();
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const refreshProfileRef = useRef(refreshProfile);
  refreshProfileRef.current = refreshProfile;

  const handleSync = useCallback(async (reason: string = 'manual') => {
    if (!user?.uid) return;
    await executeSyncUserData(user.uid, profileRef.current, reason);
  }, [user?.uid]);

  // Expose trigger globally
  useEffect(() => {
    (window as any).triggerSyncUserData = (reason: string) => {
      handleSync(reason);
    };

    const handleEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const reason = customEvent.detail?.reason || 'event';
      handleSync(reason);
    };

    window.addEventListener('trigger_sync_user_data', handleEvent);
    return () => {
      delete (window as any).triggerSyncUserData;
      window.removeEventListener('trigger_sync_user_data', handleEvent);
    };
  }, [handleSync]);

  // Automatic daily trigger after 7 AM PKT (checked on mount/tab resume, no aggressive 30-min polling)
  useEffect(() => {
    if (!user?.uid) return;

    const checkDailySync = () => {
      const now = Date.now();
      const shiftedTime = new Date(now + (5 - 7) * 60 * 60 * 1000);
      const pktDate = `${shiftedTime.getUTCFullYear()}-${shiftedTime.getUTCMonth() + 1}-${shiftedTime.getUTCDate()}`;
      
      const lastSyncKey = `last_daily_sync_${user.uid}`;
      const lastSyncDateStr = localStorage.getItem(lastSyncKey);

      if (lastSyncDateStr !== pktDate) {
        localStorage.setItem(lastSyncKey, pktDate);
        handleSync('daily_7am');
      }
    };

    checkDailySync();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkDailySync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.uid, handleSync]);

  return null;
}
