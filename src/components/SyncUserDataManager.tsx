import { useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, runWithNetwork } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { safeStorage } from '../utils/safeStorage';
import { updateChunkMetaLocalCache, getUtcVersion, getChunkMeta } from '../utils/chunkMeta';
import { normalizeUserStatusAndExpiry } from '../contexts/UsersContext';
import { UserProfile } from '../types';

export async function executeSyncUserData(currentUserUid: string, currentProfile: UserProfile | null, reason: string = 'manual'): Promise<boolean> {
  if (!currentUserUid) return false;

  const nowTime = Date.now();
  const userRef = doc(db, 'users', currentUserUid);
  const nowUtc = getUtcVersion();

  // Flush accumulated time & sessions locally into profile cache before sync
  const timeCacheKey = `accumulated_time_seconds_${currentUserUid}`;
  const accSecs = parseInt(safeStorage.getItem(timeCacheKey) || '0', 10);
  const sessionCacheKey = `accumulated_sessions_${currentUserUid}`;
  const accSessions = parseInt(safeStorage.getItem(sessionCacheKey) || '0', 10);

  if (accSecs > 0 || accSessions > 0) {
    try {
      const cachedProfileStr = safeStorage.getItem('profile_cache');
      if (cachedProfileStr) {
        const cachedP = JSON.parse(cachedProfileStr);
        if (accSecs > 0) {
          safeStorage.setItem(timeCacheKey, '0');
          cachedP.timeSpent = (cachedP.timeSpent || 0) + accSecs;
        }
        if (accSessions > 0) {
          safeStorage.setItem(sessionCacheKey, '0');
          cachedP.sessionsCount = (cachedP.sessionsCount || 0) + accSessions;
        }
        safeStorage.setItem('profile_cache', JSON.stringify(cachedP));
      }
    } catch (e) {}
  }

  // Capture starting state of all pending queues
  const startFavsStr = safeStorage.getItem('pending_favorites_array');
  const startWLStr = safeStorage.getItem('pending_watch_later_array');
  const startWatchedStr = safeStorage.getItem('pending_watched_marks');
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
    startWatchedStr ||
    startOrdersStr ||
    startReviewsStr ||
    startReportedStr ||
    startRequestsStr ||
    startUserUpdates ||
    safeStorage.getItem('needs_user_sync') === 'true'
  );

  // STEP 2: SYNC - Push local pending updates if any exist
  if (hasPending) {
    const updatesToPush: Record<string, any> = {};

    if (startFavsStr) {
      try { updatesToPush.favorites = JSON.parse(startFavsStr); } catch (e) {}
    }
    if (startWLStr) {
      try { updatesToPush.watchLater = JSON.parse(startWLStr); } catch (e) {}
    }
    if (startWatchedStr) {
      try {
        const pendingWatched = JSON.parse(startWatchedStr);
        if (Array.isArray(pendingWatched)) {
          updatesToPush.watched = pendingWatched.slice(0, 50);
        }
      } catch (e) {}
    }
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
    if (startReviewsStr) {
      try {
        const pendingReviews = JSON.parse(startReviewsStr);
        if (Array.isArray(pendingReviews) && pendingReviews.length > 0) {
          updatesToPush.pendingReviews = pendingReviews;
        }
      } catch (e) {}
    }
    if (startReportedStr) {
      try {
        const pendingReported = JSON.parse(startReportedStr);
        if (Array.isArray(pendingReported) && pendingReported.length > 0) {
          updatesToPush.reported_links = pendingReported;
        }
      } catch (e) {}
    }
    if (startRequestsStr) {
      try {
        const pendingReqs = JSON.parse(startRequestsStr);
        if (Array.isArray(pendingReqs) && pendingReqs.length > 0) {
          updatesToPush.movieRequests = pendingReqs;
        }
      } catch (e) {}
    }
    if (startUserUpdates) {
      Object.assign(updatesToPush, startUserUpdates);
    }

    const currentTheme = safeStorage.getItem('theme_preference');
    if (currentTheme && currentTheme !== (currentProfile as any)?.preferredTheme) {
      updatesToPush.preferredTheme = currentTheme;
    }

    const currentLang = safeStorage.getItem('language_preference');
    if (currentLang && currentLang !== currentProfile?.preferredLanguage) {
      updatesToPush.preferredLanguage = currentLang;
    }

    updatesToPush.lastActive = nowUtc;

    if (!navigator.onLine) {
      safeStorage.setItem('needs_user_sync', 'true');
      return false;
    }

    try {
      const batch = writeBatch(db);
      batch.set(userRef, updatesToPush, { merge: true });
      batch.set(doc(db, 'chunk_meta', 'versions'), {
        users: {
          [currentUserUid]: nowUtc
        }
      }, { merge: true });

      await runWithNetwork(() => batch.commit());

      try {
        updateChunkMetaLocalCache({ users: { [currentUserUid]: nowUtc } });
      } catch (e) {}

      // Clean up local pending queues ONLY after confirmed write success
      safeStorage.removeItem('needs_user_sync');

      if (startFavsStr) safeStorage.removeItem('pending_favorites_array');
      if (startWLStr) safeStorage.removeItem('pending_watch_later_array');
      if (startWatchedStr) safeStorage.removeItem('pending_watched_marks');
      if (startOrdersStr) safeStorage.removeItem('pending_orders_array');
      if (startReviewsStr) safeStorage.removeItem('pending_reviews_array');
      if (startReportedStr) safeStorage.removeItem('pending_reported_links');
      if (startRequestsStr) safeStorage.removeItem('pending_movie_requests');

      if (startUserUpdates) {
        const currentUserUpdatesStr = safeStorage.getItem('pending_user_updates');
        if (currentUserUpdatesStr) {
          try {
            const currentAll = JSON.parse(currentUserUpdatesStr);
            delete currentAll[currentUserUid];
            if (Object.keys(currentAll).length === 0) {
              safeStorage.removeItem('pending_user_updates');
            } else {
              safeStorage.setItem('pending_user_updates', JSON.stringify(currentAll));
            }
          } catch (e) {}
        }
      }

      safeStorage.setItem(`profile_version_${currentUserUid}`, nowUtc);

      if (currentProfile) {
        const localUpdates = { ...updatesToPush };
        const updatedProfile = { ...currentProfile, ...localUpdates };
        const json = JSON.stringify(updatedProfile);
        safeStorage.setItem('profile_cache', json);
        try { window.localStorage.setItem('profile_cache', json); } catch (e) {}
      }
    } catch (syncErr: any) {
      console.error('[SyncUserDataManager] Sync step failed:', syncErr);
      safeStorage.setItem('needs_user_sync', 'true');
      // Abort pipeline: DO NOT save 10-hour timestamp on failure!
      return false;
    }
  }

  // STEP 3: BOTH REFRESH (COMPLETED BEFORE THIS CALL) AND SYNC SUCCEEDED
  // SyncUserDataManager is responsible for saving the 10-hour timestamp after successfully syncing
  const nowMs = nowTime.toString();
  localStorage.setItem(`last_user_refresh_and_sync_time_${currentUserUid}`, nowMs);
  localStorage.setItem(`last_unified_10h_refresh_sync_time_v2_${currentUserUid}`, nowMs);
  localStorage.setItem(`last_user_sync_time_v2_${currentUserUid}`, nowMs);

  console.log(`[SyncUserDataManager] Sync step completed & 10-hour timestamp saved successfully. Reason: ${reason}`);
  return true;
}

export function SyncUserDataManager() {
  // Listen for custom trigger requests and delegate to central refresh & sync manager
  useEffect(() => {
    const handleSyncRequest = (e: Event) => {
      const customEvent = e as CustomEvent;
      const reason = customEvent.detail?.reason || 'event_trigger';
      if (typeof (window as any).triggerRefreshAppData === 'function') {
        (window as any).triggerRefreshAppData(reason);
      }
    };

    window.addEventListener('trigger_sync_user_data_immediate', handleSyncRequest);
    return () => {
      window.removeEventListener('trigger_sync_user_data_immediate', handleSyncRequest);
    };
  }, []);

  return null;
}
