import { useEffect, useCallback, useRef } from 'react';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, runWithNetwork } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { safeStorage } from '../utils/safeStorage';
import { updateChunkMetaLocalCache, getUtcVersion } from '../utils/chunkMeta';
import { UserProfile } from '../types';

export async function executeSyncUserData(currentUserUid: string, currentProfile: UserProfile | null, reason: string = 'manual'): Promise<boolean> {
  if (!currentUserUid) return false;

  const nowTime = Date.now();
  const lastSyncKey = `last_user_sync_time_${currentUserUid}`;

  const isManualTrigger = reason === 'manual' || reason === 'catalog_button' || reason === 'user_profile_button';
  const lastSyncStr = localStorage.getItem(lastSyncKey);
  const lastSyncTime = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
  const TEN_HOURS_MS = 10 * 60 * 60 * 1000;

  if (!isManualTrigger && (nowTime - lastSyncTime < TEN_HOURS_MS)) {
    // Skip connecting to Firestore. Keep accumulated values in local cache for next sync opportunity.
    return true;
  }

  const nowUtc = getUtcVersion();
  const userRef = doc(db, 'users', currentUserUid);

  // 1. Flush accumulated time & sessions
  const timeCacheKey = `accumulated_time_seconds_${currentUserUid}`;
  const accSecs = parseInt(safeStorage.getItem(timeCacheKey) || '0', 10);
  const sessionCacheKey = `accumulated_sessions_${currentUserUid}`;
  const accSessions = parseInt(safeStorage.getItem(sessionCacheKey) || '0', 10);

  if (accSecs > 0 || accSessions > 0) {
    const pendingStr = safeStorage.getItem('pending_user_updates') || '{}';
    try {
      const pendingAll = JSON.parse(pendingStr);
      pendingAll[currentUserUid] = pendingAll[currentUserUid] || {};
      if (accSecs > 0) {
        safeStorage.setItem(timeCacheKey, '0');
        const currentBaseTime = typeof pendingAll[currentUserUid].timeSpent === 'number'
          ? pendingAll[currentUserUid].timeSpent
          : (currentProfile?.timeSpent || 0);
        pendingAll[currentUserUid].timeSpent = currentBaseTime + accSecs;
      }
      if (accSessions > 0) {
        safeStorage.setItem(sessionCacheKey, '0');
        const currentBaseSessions = typeof pendingAll[currentUserUid].sessionsCount === 'number'
          ? pendingAll[currentUserUid].sessionsCount
          : (currentProfile?.sessionsCount || 0);
        pendingAll[currentUserUid].sessionsCount = currentBaseSessions + accSessions;
      }
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
    // If there is absolutely no pending data to sync, update last sync timestamp and exit immediately.
    localStorage.setItem(lastSyncKey, nowTime.toString());
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

  // Include preferredTheme / preferredLanguage ONLY if changed from currentProfile
  const currentTheme = safeStorage.getItem('theme_preference');
  if (currentTheme && currentTheme !== (currentProfile as any)?.preferredTheme) {
    updatesToPush.preferredTheme = currentTheme;
  }

  const currentLang = safeStorage.getItem('language_preference');
  if (currentLang && currentLang !== currentProfile?.preferredLanguage) {
    updatesToPush.preferredLanguage = currentLang;
  }

  // Set lastActive and updatedAt when there are pending updates
  const nowIso = new Date().toISOString();
  updatesToPush.lastActive = nowIso;
  updatesToPush.updatedAt = serverTimestamp();

  if (!navigator.onLine) {
    safeStorage.setItem('needs_user_sync', 'true');
    return false;
  }

  try {
    const batch = writeBatch(db);
    
    // 1. Write user document updates with merge
    batch.set(userRef, updatesToPush, { merge: true });

    // 2. Atomically update chunk_meta version for this user so all sessions, devices, and admin delta-sync know user data was updated
    batch.set(doc(db, 'chunk_meta', 'versions'), {
      users: {
        [currentUserUid]: nowUtc
      }
    }, { merge: true });

    await runWithNetwork(() => batch.commit());

    // 3. Update local chunk_meta cache and mtimes
    try {
      updateChunkMetaLocalCache({ users: { [currentUserUid]: nowUtc } });
    } catch (e) {}

    try {
      const mtimesStr = safeStorage.getItem('sync_user_mtimes');
      if (mtimesStr) {
        const mtimes = JSON.parse(mtimesStr);
        mtimes[currentUserUid] = nowUtc;
        safeStorage.setItem('sync_user_mtimes', JSON.stringify(mtimes));
      }
      const cachedUsersStr = safeStorage.getItem('cached_all_users');
      if (cachedUsersStr) {
        const cachedUsers = JSON.parse(cachedUsersStr);
        const idx = cachedUsers.findIndex((u: any) => u.uid === currentUserUid);
        if (idx !== -1) {
          // Replace serverTimestamp with serializable ISO string for local JSON storage
          const localUpdates = { ...updatesToPush, updatedAt: nowIso };
          cachedUsers[idx] = { ...cachedUsers[idx], ...localUpdates };
          safeStorage.setItem('cached_all_users', JSON.stringify(cachedUsers));
        }
      }
    } catch (e) {}

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
    safeStorage.setItem(`profile_version_${currentUserUid}`, nowUtc);

    // Update profile cache with serializable date strings
    if (currentProfile) {
      const localUpdates = { ...updatesToPush, updatedAt: nowIso };
      const updatedProfile = { ...currentProfile, ...localUpdates };
      safeStorage.setItem('profile_cache', JSON.stringify(updatedProfile));
    }

    localStorage.setItem(lastSyncKey, nowTime.toString());
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
  const { user, profile } = useAuth();
  const lastSyncAttemptRef = useRef<number>(0);

  const triggerSync = useCallback(async (reason: string = 'auto') => {
    if (!user?.uid) return;
    
    // Cooldown check of 5 seconds to avoid flooding writes
    const now = Date.now();
    if (now - lastSyncAttemptRef.current < 5000) return;
    lastSyncAttemptRef.current = now;

    await executeSyncUserData(user.uid, profile, reason);
  }, [user?.uid, profile]);

  // 1. Periodic sync every 2 minutes
  useEffect(() => {
    if (!user?.uid) return;

    const interval = setInterval(() => {
      // Check if there are any accumulated time/sessions or pending updates
      const timeCacheKey = `accumulated_time_seconds_${user.uid}`;
      const accSecs = parseInt(safeStorage.getItem(timeCacheKey) || '0', 10);
      const sessionCacheKey = `accumulated_sessions_${user.uid}`;
      const accSessions = parseInt(safeStorage.getItem(sessionCacheKey) || '0', 10);
      
      const needsUserSync = safeStorage.getItem('needs_user_sync') === 'true';
      const hasFavs = !!safeStorage.getItem('pending_favorites_array');
      const hasWL = !!safeStorage.getItem('pending_watch_later_array');
      const hasOrders = !!safeStorage.getItem('pending_orders_array');
      const hasUserUpdates = !!safeStorage.getItem('pending_user_updates');

      const hasPending = accSecs > 0 || accSessions > 0 || needsUserSync || hasFavs || hasWL || hasOrders || hasUserUpdates;

      if (hasPending && navigator.onLine) {
        triggerSync('periodic');
      }
    }, 120 * 1000); // 2 minutes

    return () => clearInterval(interval);
  }, [user?.uid, triggerSync]);

  // 2. Sync immediately on page visibility change to hidden
  useEffect(() => {
    if (!user?.uid) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const timeCacheKey = `accumulated_time_seconds_${user.uid}`;
        const accSecs = parseInt(safeStorage.getItem(timeCacheKey) || '0', 10);
        const sessionCacheKey = `accumulated_sessions_${user.uid}`;
        const accSessions = parseInt(safeStorage.getItem(sessionCacheKey) || '0', 10);

        const needsUserSync = safeStorage.getItem('needs_user_sync') === 'true';
        const hasFavs = !!safeStorage.getItem('pending_favorites_array');
        const hasWL = !!safeStorage.getItem('pending_watch_later_array');
        const hasOrders = !!safeStorage.getItem('pending_orders_array');
        const hasUserUpdates = !!safeStorage.getItem('pending_user_updates');

        const hasPending = accSecs > 0 || accSessions > 0 || needsUserSync || hasFavs || hasWL || hasOrders || hasUserUpdates;

        if (hasPending && navigator.onLine) {
          triggerSync('visibility_hidden');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.uid, triggerSync]);

  // 3. Monitor for custom sync request triggers
  useEffect(() => {
    const handleSyncRequest = (e: Event) => {
      const customEvent = e as CustomEvent;
      const reason = customEvent.detail?.reason || 'event_trigger';
      triggerSync(reason);
    };

    window.addEventListener('trigger_sync_user_data_immediate', handleSyncRequest);
    return () => {
      window.removeEventListener('trigger_sync_user_data_immediate', handleSyncRequest);
    };
  }, [triggerSync]);

  return null;
}
